const { Cloud189Service } = require('./cloud189');

class TaskService {
    constructor(taskRepo, accountRepo, taskLogRepo) {
        this.taskRepo = taskRepo;
        this.accountRepo = accountRepo;
        this.taskLogRepo = taskLogRepo;
    }

    // 解析分享链接
    async parseShareLink(cloud189, shareLink) {
         // 解析分享链接
         let shareCode;
         const shareUrl = new URL(shareLink);
         if (shareUrl.pathname === '/web/share') {
             shareCode = shareUrl.searchParams.get('code');
         } else if (shareUrl.pathname.startsWith('/t/')) {
             shareCode = shareUrl.pathname.split('/').pop();
         }
         
         if (!shareCode) throw new Error('无效的分享链接');
         
         const shareInfo = await cloud189.getShareInfo(shareCode);
         if (!shareInfo || !shareInfo.shareId) throw new Error('获取分享信息失败');
         return shareInfo;
    }

    // 创建新任务
    async createTask(accountId, shareLink, targetFolderId, videoType, totalEpisodes = null) {
        // 获取分享信息
        const account = await this.accountRepo.findOneBy({ id: accountId });
        if (!account) throw new Error('账号不存在');
        
        const cloud189 = Cloud189Service.getInstance(account);
        const shareInfo = await this.parseShareLink(cloud189, shareLink);
        // 判断目录是否存在
        const folderInfo = await cloud189.listFiles(targetFolderId);
        if (folderInfo.fileListAO.folderList.length > 0 && folderInfo.fileListAO.folderList.find(folder => folder.name === shareInfo.fileName)) {
            throw new Error('目标已存在同名目录，请选择其他目录');
        }
        // 创建目录
        const targetFolder = await cloud189.createFolder(shareInfo.fileName, targetFolderId);
        if (!targetFolder || !targetFolder.id) throw new Error('创建目录失败');
        const rootFolderId =  targetFolder.id
        const tasks = [];
        const baseName = shareInfo.fileName;
        
        // 如果是文件夹，检查是否需要拆分
        if (shareInfo.isFolder) {
            const result = await cloud189.listShareDir(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode);
            if (result && result.fileListAO) {
                const rootFiles = result.fileListAO.fileList || [];
                const subFolders = result.fileListAO.folderList || [];
                
                // 如果根目录有文件，创建根任务
                if (rootFiles.length > 0) {
                    const rootTask = this.taskRepo.create({
                        accountId,
                        shareLink,
                        targetFolderId,
                        realFolderId: rootFolderId,
                        videoType,
                        status: 'pending',
                        totalEpisodes,
                        resourceName: `${baseName}(根)`,
                        currentEpisodes: rootFiles.length,
                        shareFolderId: shareInfo.fileId,
                        shareFolderName: "",
                        shareId: shareInfo.shareId,
                        shareMode: shareInfo.shareMode,
                        pathType: "root"
                    });
                    tasks.push(await this.taskRepo.save(rootTask));
                }
                
                // 为每个子文件夹创建任务
                for (const folder of subFolders) {
                    const realFolder = await cloud189.createFolder(folder.name, rootFolderId);
                    if (!realFolder || !realFolder.id) throw new Error('创建目录失败');
                    const subTask = this.taskRepo.create({
                        accountId,
                        shareLink,
                        targetFolderId,
                        realFolderId:realFolder.id,
                        videoType,
                        status: 'pending',
                        totalEpisodes,
                        resourceName: `${baseName}`,
                        currentEpisodes: 0,
                        shareFolderId: folder.id,
                        shareFolderName: folder.name,
                        shareId: shareInfo.shareId,
                        shareMode: shareInfo.shareMode,
                        pathType: "sub"
                    });
                    tasks.push(await this.taskRepo.save(subTask));
                }
            }
        }
        
        // 如果没有拆分任务（纯文件或单文件夹），创建单个任务
        if (tasks.length === 0) {
             // 获取分享文件列表
            const shareFiles = await cloud189.getAllShareFiles(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode);
            if (!shareFiles || shareFiles.length === 0) throw new Error('获取文件列表失败');
            const task = this.taskRepo.create({
                accountId,
                shareLink,
                targetFolderId,
                realFolderId: rootFolderId,
                videoType,
                status: 'pending',
                totalEpisodes,
                resourceName: baseName,
                currentEpisodes: shareFiles.length,
                shareFolderId:  shareInfo.fileId,
                shareFolderName: "",
                shareId: shareInfo.shareId,
                shareMode: shareInfo.shareMode,
                pathType: "root"
            });
            tasks.push(await this.taskRepo.save(task));
        }
        
        return tasks;
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
        // const folders = folderInfo.fileListAO.folderList || [];

        // for (const folder of folders) {
        //     const subFiles = await this.getAllFolderFiles(cloud189, folder.id);
        //     allFiles = allFiles.concat(subFiles);
        // }

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
            const shareInfo = await this.parseShareLink(cloud189, task.shareLink);
             // 获取分享文件列表并进行增量转存
             const shareDir = await cloud189.listShareDir(task.shareId, task.shareFolderId, task.shareMode);
             if (!shareDir || !shareDir.fileListAO.fileList) {
                console.log("获取文件列表失败: " + JSON.stringify(shareDir))
                 throw new Error('获取文件列表失败');
            }
            let shareFiles = [...shareDir.fileListAO.fileList];
            let existingFiles = new Set();
            
            const folderFiles = await this.getAllFolderFiles(cloud189, task.realFolderId);
            existingFiles = new Set(
                    folderFiles
                        .filter(file => !file.isFolder)
                        .map(file => file.md5)
                );
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
                    fileNameList.push(file.name);
                }
                await cloud189.createSaveTask(
                    JSON.stringify(taskInfoList),
                    task.realFolderId,
                    shareInfo.shareId
                );
                const resourceName = task.shareFolderName? `${task.resourceName}/${task.shareFolderName}` : task.resourceName;
                saveResults.push(`${resourceName}更新${taskInfoList.length}集: > \n <font color="warning">${fileNameList.join('\n')}</font>`);
                task.status = 'processing';
                task.lastFileUpdateTime = new Date();
                task.currentEpisodes = existingFiles.size + newFiles.length;
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
            return saveResults.join('\n\n');

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