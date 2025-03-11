const { Cloud189Service } = require('./cloud189');

class TaskService {
    constructor(taskRepo, accountRepo, taskLogRepo) {
        this.taskRepo = taskRepo;
        this.accountRepo = accountRepo;
        this.taskLogRepo = taskLogRepo;
    }

    // 创建新任务
    async createTask(accountId, shareLink, targetFolderId, videoType, totalEpisodes = null) {
        const task = this.taskRepo.create({
            accountId,
            shareLink,
            targetFolderId,
            videoType: videoType,
            status: 'pending',
            totalEpisodes
        });
        return await this.taskRepo.save(task);
    }

    // 删除任务
    async deleteTask(taskId) {
        const task = await this.taskRepo.findOneBy({ id: taskId });
        if (!task) throw new Error('任务不存在');
        await this.taskRepo.remove(task);
    }

    // 记录任务日志
    async logTaskEvent(taskId, node, status, message = null, data = null) {
        // const log = this.taskLogRepo.create({
        //     taskId,
        //     node,
        //     status,
        //     message,
        //     data: data ? JSON.stringify(data) : null
        // });
        // await this.taskLogRepo.save(log);
    }

    // 获取文件夹下的所有文件
    async getAllFolderFiles(cloud189, folderId) {
        const folderInfo = await cloud189.listFiles(folderId);
        if (!folderInfo || !folderInfo.fileListAO) {
            return [];
        }

        let allFiles = [...(folderInfo.fileListAO.fileList || [])];
        const folders = folderInfo.fileListAO.folderList || [];

        for (const folder of folders) {
            const subFiles = await this.getAllFolderFiles(cloud189, folder.id);
            allFiles = allFiles.concat(subFiles);
        }

        return allFiles;
    }

    // 执行任务
    async processTask(task) {
        let saveResults = [];
        try {
            const account = await this.accountRepo.findOneBy({ id: task.accountId });
            if (!account) {
                throw new Error('账号不存在');
            }

            const cloud189 = Cloud189Service.getInstance(account);
            
            // 解析分享链接
            let shareCode;
            const shareUrl = new URL(task.shareLink);
            if (shareUrl.pathname === '/web/share') {
                // 处理格式1: https://cloud.189.cn/web/share?code=xxx
                shareCode = shareUrl.searchParams.get('code');
            } else if (shareUrl.pathname.startsWith('/t/')) {
                // 处理格式2: https://cloud.189.cn/t/xxx
                shareCode = shareUrl.pathname.split('/').pop();
            }

            if (!shareCode) {
                console.log("无效的分享链接: " + task.shareLink);
                throw new Error('无效的分享链接');
            }
            console.log("分享链接Code: " + shareCode);
            const shareInfo = await cloud189.getShareInfo(shareCode);
            if (!shareInfo || !shareInfo.shareId) {
                console.log("获取分享信息失败: " + JSON.stringify(shareInfo))
                throw new Error('获取分享信息失败');
            }
            console.log("获取分享信息: " + JSON.stringify(shareInfo))

            // 如果任务没有资源名称，使用分享文件名填充
            if (!task.resourceName) {
                task.resourceName = shareInfo.fileName;
                await this.taskRepo.save(task);
            }

             // 获取分享文件列表并进行增量转存
             const shareFiles = await cloud189.getAllShareFiles(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode);
             if (!shareFiles || shareFiles.length === 0) {
                 console.log("获取文件列表失败: " + JSON.stringify(shareFiles))
                 throw new Error('获取文件列表失败');
             }

            let existingFiles = new Set();
            let targetFolderId = task.targetFolderId;

            // 如果存在realFolderId，直接获取文件夹内容
            if (task.realFolderId) {
                console.log("======== 文件已存在，直接获取文件夹内容 ========")
                const folderFiles = await this.getAllFolderFiles(cloud189, task.realFolderId);
                existingFiles = new Set(
                    folderFiles
                        .filter(file => !file.isFolder)
                        .map(file => file.md5)
                );
                targetFolderId = task.realFolderId;
            } else {
                // 搜索个人网盘是否存在
                const searchFileName = shareInfo.fileName.replace(/\s*\([^)]*\)\s*/g, '').trim();
                const searchResult = await cloud189.searchFiles(searchFileName);


                // 如果文件不存在，直接转存
                if (!searchResult || !searchResult.fileList || searchResult.fileList.length === 0) {
                    console.log("========= 文件不存在，直接转存 ========")
                    const fileId = shareInfo.fileId;
                    const fileName = shareInfo.fileName;
                    const isFolder = shareInfo.isFolder?1:0;
                    const taskInfos = JSON.stringify([{ fileId, fileName, isFolder }]);
                    await cloud189.createSaveTask(
                        taskInfos,
                        targetFolderId,
                        shareInfo.shareId
                    );
                                        
                    saveResults.push(`转存 ${shareInfo.fileName} 共${shareFiles.length}集, 文件夹名为: \n > <font color="warning">${fileName}</font>\n`);

                    // 如果是电影或临时目录，直接标记为完成
                    if (task.videoType === 'movie' || task.videoType ==='temp' || (task.totalEpisodes && task.totalEpisodes == shareFiles.length)) {
                        task.status = 'completed';
                    } else {
                        task.status = 'processing';
                    }
                    task.lastCheckTime = new Date();
                    task.lastFileUpdateTime = new Date();
                    task.currentEpisodes = shareFiles.length
                    await this.taskRepo.save(task);
                    return saveResults.join('\n');
                }

                // 如果是电影类型且文件已存在，直接标记为完成
                if (task.videoType === 'movie') {
                    task.status = 'completed';
                    task.lastCheckTime = new Date();
                    await this.taskRepo.save(task);
                    return '';
                }

                // 获取现有文件的MD5
                existingFiles = new Set(
                    searchResult.fileList
                        .filter(file => !file.isFolder)
                        .map(file => file.md5)
                );

                // 更新realFolderId
                if (searchResult.folderList && searchResult.folderList.length > 0) {
                    const folderInfo = await cloud189.listFiles(searchResult.folderList[0].id);
                    if (folderInfo.fileListAO.folderList && folderInfo.fileListAO.folderList.length > 0) {
                        task.realFolderId = folderInfo.fileListAO.folderList[0].id;
                        targetFolderId = task.realFolderId;
                        // 更新文件计数
                        const allFiles = await this.getAllFolderFiles(cloud189, task.realFolderId);
                        task.currentEpisodes = allFiles.length;
                    }
                }
            }

            const newFiles = shareFiles
                .filter(file => !file.isFolder && !existingFiles.has(file.md5));

            if (newFiles.length > 0) {
                const taskInfoList = [];
                const fileNameList = [];
                for (const file of newFiles) {
                    taskInfoList.push({
                        fileId: file.id,
                        fileName: file.name,
                        isFolder: 0
                    });
                    fileNameList.push(` > <font color="warning">${file.name}</font>`);
                }
                await cloud189.createSaveTask(
                    JSON.stringify(taskInfoList),
                    targetFolderId,
                    shareInfo.shareId
                );
                saveResults.push(`${shareInfo.fileName}更新${taskInfoList.length}集: \n ${fileNameList.join("\n")}`);
                task.status = 'processing';
                task.lastFileUpdateTime = new Date();
                task.currentEpisodes += newFiles.length;
            } else if (task.lastFileUpdateTime) {
                // 检查是否超过3天没有新文件
                const now = new Date();
                const lastUpdate = new Date(task.lastFileUpdateTime);
                const daysDiff = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
                if (daysDiff >= 3) {
                    task.status = 'completed';
                }
                console.log("====== ${task.resourceName} 没有增量剧集 =======")
            }
            // 检查是否达到总数
            if (task.totalEpisodes && task.currentEpisodes >= task.totalEpisodes) {
                task.status = 'completed';
                console.log(`======= ${task.resourceName} 已完结 ========`)
            }

            task.lastCheckTime = new Date();
            await this.taskRepo.save(task);
            return saveResults.join('\n');

        } catch (error) {
            console.log(error)
            task.status = 'failed';
            task.lastError = error.message;
            await this.taskRepo.save(task);
            return '';
        }
    }

    // 获取所有任务
    async getTasks() {
        return await this.taskRepo.find({
            order: {
                id: 'DESC'
            }
        });
    }

    // 获取待处理任务
    async getPendingTasks() {
        return await this.taskRepo.find({
            where: [
                { status: 'pending' },
                { status: 'processing' }
            ]
        });
    }

    // 更新任务
    async updateTask(taskId, updates) {
        const task = await this.taskRepo.findOneBy({ id: taskId });
        if (!task) throw new Error('任务不存在');

        // 只允许更新特定字段
        const allowedFields = ['videoType', 'realFolderId', 'currentEpisodes', 'totalEpisodes', 'status'];
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                task[field] = updates[field];
            }
        }

        // 验证状态值
        const validStatuses = ['pending', 'processing', 'completed', 'failed'];
        if (!validStatuses.includes(task.status)) {
            throw new Error('无效的状态值');
        }

        // 验证数值字段
        if (task.currentEpisodes !== null && task.currentEpisodes < 0) {
            throw new Error('更新数不能为负数');
        }
        if (task.totalEpisodes !== null && task.totalEpisodes < 0) {
            throw new Error('总数不能为负数');
        }

        return await this.taskRepo.save(task);
    }
}

module.exports = { TaskService };