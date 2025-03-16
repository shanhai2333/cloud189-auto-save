const { Cloud189Service } = require('./cloud189');

class TaskService {
    constructor(taskRepo, accountRepo, taskLogRepo) {
        this.taskRepo = taskRepo;
        this.accountRepo = accountRepo;
        this.taskLogRepo = taskLogRepo;
    }

    // 解析分享码
    async parseShareCode(shareLink) {
        // 解析分享链接
        let shareCode;
        const shareUrl = new URL(shareLink);
        if (shareUrl.pathname === '/web/share') {
            shareCode = shareUrl.searchParams.get('code');
        } else if (shareUrl.pathname.startsWith('/t/')) {
            shareCode = shareUrl.pathname.split('/').pop();
        }
        
        if (!shareCode) throw new Error('无效的分享链接');
        return shareCode
    }

    // 解析分享链接
    async getShareInfo(cloud189, shareCode) {
         const shareInfo = await cloud189.getShareInfo(shareCode);
         if (!shareInfo) throw new Error('获取分享信息失败');
         return shareInfo;
    }

    // 创建任务的基础配置
    _createTaskConfig(accountId, shareLink, targetFolderId, videoType, totalEpisodes, shareInfo, realFolder, resourceName, currentEpisodes = 0, shareFolderId = null, shareFolderName = "") {
        return {
            accountId,
            shareLink,
            targetFolderId,
            realFolderId:realFolder.id,
            realFolderName:realFolder.name,
            videoType,
            status: 'pending',
            totalEpisodes,
            resourceName,
            currentEpisodes,
            shareFileId: shareInfo.fileId,
            shareFolderId: shareFolderId || shareInfo.fileId,
            shareFolderName,
            shareId: shareInfo.shareId,
            shareMode: shareInfo.shareMode,
            accessCode: shareInfo.userAccessCode
        };
    }

     // 验证并创建目标目录
     async _validateAndCreateTargetFolder(cloud189, targetFolderId, shareInfo) {
        const folderInfo = await cloud189.listFiles(targetFolderId);
        if (folderInfo.fileListAO.folderList.length > 0 && 
            folderInfo.fileListAO.folderList.find(folder => folder.name === shareInfo.fileName)) {
            throw new Error('目标已存在同名目录，请选择其他目录');
        }
        
        const targetFolder = await cloud189.createFolder(shareInfo.fileName, targetFolderId);
        if (!targetFolder || !targetFolder.id) throw new Error('创建目录失败');
        return targetFolder;
    }

    // 处理文件夹分享
    async _handleFolderShare(cloud189, shareInfo, accountId, shareLink, targetFolderId, videoType, totalEpisodes, rootFolder, tasks) {
        const result = await cloud189.listShareDir(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode, shareInfo.userAccessCode);
        if (!result?.fileListAO) return;

        const { fileList: rootFiles = [], folderList: subFolders = [] } = result.fileListAO;
        
        // 处理根目录文件
        if (rootFiles.length > 0) {
            const rootTask = this.taskRepo.create(
                this._createTaskConfig(
                    accountId, shareLink, targetFolderId, videoType, totalEpisodes,
                    shareInfo, rootFolder, `${shareInfo.fileName}(根)`, rootFiles.length
                )
            );
            tasks.push(await this.taskRepo.save(rootTask));
        }

        // 处理子文件夹
        for (const folder of subFolders) {
            const realFolder = await cloud189.createFolder(folder.name, rootFolder.id);
            if (!realFolder?.id) throw new Error('创建目录失败');

            const subTask = this.taskRepo.create(
                this._createTaskConfig(
                    accountId, shareLink, targetFolderId, videoType, totalEpisodes,
                    shareInfo, realFolder, shareInfo.fileName, 0, folder.id, folder.name
                )
            );
            tasks.push(await this.taskRepo.save(subTask));
        }
    }

    // 处理单文件分享
    async _handleSingleShare(cloud189, shareInfo, accountId, shareLink, targetFolderId, videoType, totalEpisodes, rootFolderId, tasks) {
        const shareFiles = await cloud189.getAllShareFiles(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode, shareInfo.userAccessCode);
        if (!shareFiles?.length) throw new Error('获取文件列表失败');

        const task = this.taskRepo.create(
            this._createTaskConfig(
                accountId, shareLink, targetFolderId, videoType, totalEpisodes,
                shareInfo, rootFolderId, shareInfo.fileName, shareFiles.length
            )
        );
        tasks.push(await this.taskRepo.save(task));
    }

    // 创建新任务
    async createTask(accountId, shareLink, targetFolderId, videoType, totalEpisodes = null, accessCode = null) {
        // 获取分享信息
        const account = await this.accountRepo.findOneBy({ id: accountId });
        if (!account) throw new Error('账号不存在');
        
        const cloud189 = Cloud189Service.getInstance(account);
        const shareCode = await this.parseShareCode(shareLink);
        const shareInfo = await this.getShareInfo(cloud189, shareCode);
        // 如果分享链接是加密链接, 且没有提供访问码, 则抛出错误
        if (shareInfo.needAccessCode == 1 ) {
            if (!accessCode) {
                throw new Error('分享链接为加密链接, 请提供访问码');
            }
            // 校验访问码是否有效
            const accessCodeResponse = await cloud189.checkAccessCode(shareCode, accessCode);
            console.log(accessCodeResponse)
            if (!accessCodeResponse.shareId) {
                throw new Error('访问码无效');
            }
            shareInfo.shareId = accessCodeResponse.shareId;
        }
        if (!shareInfo.shareId) {
            throw new Error('获取分享信息失败');
        }
        // 检查并创建目标目录
        const rootFolder = await this._validateAndCreateTargetFolder(cloud189, targetFolderId, shareInfo);
        const tasks = [];
        shareInfo.userAccessCode = accessCode;
        if (shareInfo.isFolder) {
            await this._handleFolderShare(cloud189, shareInfo, accountId, shareLink, targetFolderId, videoType, totalEpisodes, rootFolder, tasks);
        }

         // 处理单文件或空文件夹情况
         if (tasks.length === 0) {
            await this._handleSingleShare(cloud189, shareInfo, accountId, shareLink, targetFolderId, videoType, totalEpisodes, rootFolder, tasks);
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
             // 获取分享文件列表并进行增量转存
             const shareDir = await cloud189.listShareDir(task.shareId, task.shareFolderId, task.shareMode,task.accessCode);
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
                    fileNameList.push(` > <font color="warning">${file.name}</font>`);
                }
                await cloud189.createSaveTask(
                    JSON.stringify(taskInfoList),
                    task.realFolderId,
                    task.shareId
                );
                const resourceName = task.shareFolderName? `${task.resourceName}/${task.shareFolderName}` : task.resourceName;
                saveResults.push(`${resourceName}更新${taskInfoList.length}集: \n ${fileNameList.join('\n')}`);
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
                console.log(`====== ${task.resourceName} 没有增量剧集 =======`)
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
        const allowedFields = ['resourceName','videoType', 'realFolderId', 'currentEpisodes', 'totalEpisodes', 'status', 'shareFolderName', 'shareFolderId'];
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