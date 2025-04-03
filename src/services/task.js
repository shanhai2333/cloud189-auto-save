const { LessThan, In } = require('typeorm');
const { Cloud189Service } = require('./cloud189');
const { MessageUtil } = require('./message');
const { logTaskEvent } = require('../utils/logUtils');
const ConfigService = require('./ConfigService');
const { CreateTaskDto } = require('../dto/TaskDto');
const { BatchTaskDto } = require('../dto/BatchTaskDto');
const { SchedulerService } = require('./scheduler');

class TaskService {
    constructor(taskRepo, accountRepo, taskLogRepo) {
        this.taskRepo = taskRepo;
        this.accountRepo = accountRepo;
        this.taskLogRepo = taskLogRepo;
        this.messageUtil = new MessageUtil();
    }

    // 解析分享码
    async parseShareCode(shareLink) {
        // 解析分享链接
        let shareCode;
        const shareUrl = new URL(shareLink);
        if (shareUrl.origin.includes('content.21cn.com')) {
            // 处理订阅链接
            const params = new URLSearchParams(shareUrl.hash.split('?')[1]);
            shareCode = params.get('shareCode');
        } else if (shareUrl.pathname === '/web/share') {
            shareCode = shareUrl.searchParams.get('code');
        } else if (shareUrl.pathname.startsWith('/t/')) {
            shareCode = shareUrl.pathname.split('/').pop();
        }else if (shareUrl.hash && shareUrl.hash.includes('/t/')) {
            shareCode = shareUrl.hash.split('/').pop();
        }else if (shareUrl.pathname.includes('share.html')) {
            // 其他可能的 share.html 格式
            const hashParts = shareUrl.hash.split('/');
            shareCode = hashParts[hashParts.length - 1];
        }
        
        if (!shareCode) throw new Error('无效的分享链接');
        return shareCode
    }

    // 解析分享链接
    async getShareInfo(cloud189, shareCode) {
         const shareInfo = await cloud189.getShareInfo(shareCode);
         if (!shareInfo) throw new Error('获取分享信息失败');
         if(shareInfo.res_code == "ShareAuditWaiting") {
            throw new Error('分享链接审核中, 请稍后再试');
         }
         return shareInfo;
    }

    // 创建任务的基础配置
    _createTaskConfig(taskDto, shareInfo, realFolder, resourceName, currentEpisodes = 0, shareFolderId = null, shareFolderName = "") {
        return {
            accountId: taskDto.accountId,
            shareLink: taskDto.shareLink,
            targetFolderId: taskDto.targetFolderId,
            realFolderId:realFolder.id,
            realFolderName:realFolder.name,
            status: 'pending',
            totalEpisodes: taskDto.totalEpisodes,
            resourceName,
            currentEpisodes,
            shareFileId: shareInfo.fileId,
            shareFolderId: shareFolderId || shareInfo.fileId,
            shareFolderName,
            shareId: shareInfo.shareId,
            shareMode: shareInfo.shareMode,
            accessCode: taskDto.accessCode,
            matchPattern: taskDto.matchPattern,
            matchOperator: taskDto.matchOperator,
            matchValue: taskDto.matchValue,
            remark: taskDto.remark
        };
    }

     // 验证并创建目标目录
     async _validateAndCreateTargetFolder(cloud189, taskDto, shareInfo) {
        const folderInfo = await cloud189.listFiles(taskDto.targetFolderId);
        if (!folderInfo) {
            throw new Error('获取文件列表失败');
        }
        // 检查目标文件夹是否存在
        const { folderList = [] } = folderInfo.fileListAO;
        const existFolder = folderList.find(folder => folder.name === shareInfo.fileName);
        if (existFolder) {
            if (!taskDto.overwriteFolder) {
                throw new Error('folder already exists');
            }
            // 如果用户需要覆盖, 则删除目标目录
            const batchTaskDto = new BatchTaskDto({
                taskInfos: JSON.stringify([{
                    fileId: existFolder.id,
                    fileName: existFolder.name,
                    isFolder: 1
                }]),
                type: 'DELETE',
                targetFolderId: ''
            });
            await this.createBatchTask(cloud189, batchTaskDto)
        }
        
        const targetFolder = await cloud189.createFolder(shareInfo.fileName, taskDto.targetFolderId);
        if (!targetFolder || !targetFolder.id) throw new Error('创建目录失败');
        return targetFolder;
    }

    // 处理文件夹分享
    async _handleFolderShare(cloud189, shareInfo, taskDto, rootFolder, tasks) {
        const result = await cloud189.listShareDir(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode, taskDto.accessCode);
        if (!result?.fileListAO) return;

        const { fileList: rootFiles = [], folderList: subFolders = [] } = result.fileListAO;
        
        // 处理根目录文件
        if (rootFiles.length > 0) {
            const rootTask = this.taskRepo.create(
                this._createTaskConfig(
                    taskDto,
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
                    taskDto,
                    shareInfo, realFolder, shareInfo.fileName, 0, folder.id, folder.name
                )
            );
            tasks.push(await this.taskRepo.save(subTask));
        }
    }

    // 处理单文件分享
    async _handleSingleShare(cloud189, shareInfo, taskDto, rootFolderId, tasks) {
        const shareFiles = await cloud189.getShareFiles(shareInfo.shareId, shareInfo.fileId, shareInfo.shareMode, taskDto.accessCode, false);
        if (!shareFiles?.length) throw new Error('获取文件列表失败');

        const task = this.taskRepo.create(
            this._createTaskConfig(
                taskDto,
                shareInfo, rootFolderId, shareInfo.fileName, shareFiles.length
            )
        );
        tasks.push(await this.taskRepo.save(task));
    }

    // 创建新任务
    async createTask(params) {
        const taskDto = new CreateTaskDto(params);
        taskDto.validate();
        // 获取分享信息
        const account = await this.accountRepo.findOneBy({ id: taskDto.accountId });
        if (!account) throw new Error('账号不存在');
        
        const cloud189 = Cloud189Service.getInstance(account);
        const shareCode = await this.parseShareCode(taskDto.shareLink);
        const shareInfo = await this.getShareInfo(cloud189, shareCode);
        // 如果分享链接是加密链接, 且没有提供访问码, 则抛出错误
        if (shareInfo.shareMode == 1 ) {
            if (!taskDto.accessCode) {
                throw new Error('分享链接为加密链接, 请提供访问码');
            }
            // 校验访问码是否有效
            const accessCodeResponse = await cloud189.checkAccessCode(shareCode, taskDto.accessCode);
            if (!accessCodeResponse) {
                throw new Error('校验访问码失败');
            }
            if (!accessCodeResponse.shareId) {
                throw new Error('访问码无效');
            }
            shareInfo.shareId = accessCodeResponse.shareId;
        }
        if (!shareInfo.shareId) {
            throw new Error('获取分享信息失败');
        }
        // 检查并创建目标目录
        const rootFolder = await this._validateAndCreateTargetFolder(cloud189, taskDto, shareInfo);
        const tasks = [];
        if (shareInfo.isFolder) {
            await this._handleFolderShare(cloud189, shareInfo, taskDto, rootFolder, tasks);
        }

         // 处理单文件或空文件夹情况
         if (tasks.length === 0) {
            await this._handleSingleShare(cloud189, shareInfo, taskDto, rootFolder, tasks);
        }
        if (taskDto.enableCron) {
            for(const task of tasks) {
                SchedulerService.saveTaskJob(task, this)   
            }
        }
        return tasks;
    }

    // 删除任务
    async deleteTask(taskId) {
        const task = await this.taskRepo.findOneBy({ id: taskId });
        if (!task) throw new Error('任务不存在');
        await this.taskRepo.remove(task);
    }

    // 批量删除
    async deleteTasks(taskIds) {
        const tasks = await this.taskRepo.findBy({ id: In(taskIds) });
        if (!tasks || tasks.length === 0) throw new Error('任务不存在');
        await this.taskRepo.remove(tasks);
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
             if(shareDir.res_code == "ShareAuditWaiting") {
                logTaskEvent("分享链接审核中, 等待下次执行")
                return ''
             }
             if (!shareDir || !shareDir.fileListAO.fileList) {
                 logTaskEvent("获取文件列表失败: " + JSON.stringify(shareDir))
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
                .filter(file => !file.isFolder && !existingFiles.has(file.md5) && this._handleMatchMode(task, file));

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
                const batchTaskDto = new BatchTaskDto({
                    taskInfos: JSON.stringify(taskInfoList),
                    type: 'SHARE_SAVE',
                    targetFolderId: task.realFolderId,
                    shareId: task.shareId
                });
                await this.createBatchTask(cloud189, batchTaskDto)
                const resourceName = task.shareFolderName? `${task.resourceName}/${task.shareFolderName}` : task.resourceName;
                // 防止文件数量过长, 消息推送只保留前5个和最后5个
                if (fileNameList.length > 20) {
                    fileNameList.splice(5, fileNameList.length - 10, '> <font color="warning">...</font>');
                }
                saveResults.push(`${resourceName}更新${taskInfoList.length}集: \n ${fileNameList.join('\n')}`);
                task.status = 'processing';
                task.lastFileUpdateTime = new Date();
                task.currentEpisodes = existingFiles.size + newFiles.length;
                task.retryCount = 0;
                this.autoRename(cloud189, task)
            } else if (task.lastFileUpdateTime) {
                // 检查是否超过3天没有新文件
                const now = new Date();
                const lastUpdate = new Date(task.lastFileUpdateTime);
                const daysDiff = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
                if (daysDiff >= ConfigService.getConfigValue('task.taskExpireDays')) {
                    task.status = 'completed';
                }
                logTaskEvent(`====== ${task.resourceName} 没有增量剧集 =======`)
            }
            // 检查是否达到总数
            if (task.totalEpisodes && task.currentEpisodes >= task.totalEpisodes) {
                task.status = 'completed';
                logTaskEvent(`======= ${task.resourceName} 已完结 ========`)
            }

            task.lastCheckTime = new Date();
            await this.taskRepo.save(task);
            return saveResults.join('\n');

        } catch (error) {
            return await this._handleTaskFailure(task, error);
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
                {
                    status: 'pending',
                    nextRetryTime: null,
                    enableCron: false
                },
                {
                    status: 'processing',
                    enableCron: false
                }
            ]
        });
    }

    // 更新任务
    async updateTask(taskId, updates) {
        const task = await this.taskRepo.findOneBy({ id: taskId });
        if (!task) throw new Error('任务不存在');

        // 只允许更新特定字段
        const allowedFields = ['resourceName', 'realFolderId', 'currentEpisodes', 'totalEpisodes', 'status', 'shareFolderName', 'shareFolderId', 'matchPattern','matchOperator','matchValue','remark', 'enableCron', 'cronExpression'];
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                task[field] = updates[field];
            }
        }
        // 如果currentEpisodes和totalEpisodes为null 则设置为0
        if (task.currentEpisodes === null) {
            task.currentEpisodes = 0;
        }
        if (task.totalEpisodes === null) {
            task.totalEpisodes = 0;
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
        if (task.matchPattern && !task.matchValue) {
            throw new Error('匹配模式需要提供匹配值');
        }
        const newTask = await this.taskRepo.save(task)
        SchedulerService.removeTaskJob(task.id)
        if (task.enableCron && task.cronExpression) {
            SchedulerService.saveTaskJob(newTask, this)
        }
        return newTask;
    }

    // 自动重命名
    async autoRename(cloud189, task) {
        if (!task.sourceRegex || !task.targetRegex) return;
        const folderInfo = await cloud189.listFiles(task.realFolderId);
        if (!folderInfo ||!folderInfo.fileListAO) return;
        const files = folderInfo.fileListAO.fileList;
        const message = []
        for (const file of files) {
            if (file.isFolder) continue;
            const destFileName = file.name.replace(new RegExp(task.sourceRegex), task.targetRegex);
            if (destFileName === file.name) continue;
            const renameResult = await cloud189.renameFile(file.id, destFileName);
            if (!renameResult) {
                throw new Error('重命名失败');
            }
            if (renameResult.res_code != 0) {
                logTaskEvent(`${file.name}重命名为${destFileName}失败, 原因:${destFileName}${renameResult.res_msg}`)
                message.push(` > <font color="comment">${file.name} → ${destFileName}失败, 原因:${destFileName}${renameResult.res_msg}</font>`)
            }else{
                logTaskEvent(`${file.name}重命名为${destFileName}成功`)
                message.push(` > <font color="info">${file.name} → ${destFileName}成功</font>`)
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        this.messageUtil.sendMessage(`${task.resourceName}自动重命名: \n ${message.join('\n')}`)
    }

    // 检查任务状态
    async checkTaskStatus(cloud189, taskId, count = 0, type = "SHARE_SAVE") {
        if (count > 5) {
             return false;
        }
        // 轮询任务状态
        const task = await cloud189.checkTaskStatus(taskId, type)
        if (!task) {
            return false;
        }
        if (task.taskStatus == 3) {
            // 暂停200毫秒
            await new Promise(resolve => setTimeout(resolve, 200));
            return await this.checkTaskStatus(cloud189,taskId, count++, type)
        }
        if (task.taskStatus == 4) {
            return true;
        }
        // 如果status == 2 说明有冲突
        if (task.taskStatus == 2) {
            const conflictTaskInfo = await cloud189.getConflictTaskInfo(taskId);
            if (!conflictTaskInfo) {
                return false
            }
            // 忽略冲突
            const taskInfos = conflictTaskInfo.taskInfos;
            for (const taskInfo of taskInfos) {
                taskInfo.dealWay = 1;
            }
            await cloud189.manageBatchTask(taskId, conflictTaskInfo.targetFolderId, taskInfos);
            await new Promise(resolve => setTimeout(resolve, 200));
            return await this.checkTaskStatus(cloud189, taskId, count++, type)
        }
        return false;
    }

    // 执行所有任务
    async processAllTasks() {
        logTaskEvent('开始执行所有任务')
        const tasks = await this.getPendingTasks();
        let saveResults = []
        for (const task of tasks) {
            try {
            const result = await this.processTask(task);
            if (result) {
                saveResults.push(result)
            }
            } catch (error) {
                console.error(`任务${task.id}执行失败:`, error);
            }
            // 暂停500ms
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (saveResults.length > 0) {
            this.messageUtil.sendMessage(saveResults.join("\n\n"))
        }
        logTaskEvent('所有任务执行完毕')
        return saveResults
    }
    // 处理匹配模式
    _handleMatchMode(task, file) {
        if (!task.matchPattern || !task.matchValue) {
            return true;
        } 
        const matchPattern = task.matchPattern;
        const matchOperator = task.matchOperator; // lt eq gt
        const matchValue = task.matchValue;
        const regex = new RegExp(matchPattern);
        // 根据正则表达式提取文件名中匹配上的值 然后根据matchOperator判断是否匹配
        const match = file.name.match(regex);
        if (match) {
            const matchResult = match[0];
            const values = this._handleMatchValue(matchOperator, matchResult, matchValue);
            if (matchOperator === 'lt' && values[0] < values[1]) {
                return true;
            }
            if (matchOperator === 'eq' && values[0] === values[1]) {
                return true;
            }
            if (matchOperator === 'gt' && values[0] > values[1]) {
                return true;
            }
        }
        return false;
    }

    // 根据matchOperator判断值是否要转换为数字
    _handleMatchValue(matchOperator, matchResult, matchValue) {    
        if (matchOperator === 'lt' || matchOperator === 'gt') {
            return [parseFloat(matchResult), parseFloat(matchValue)];
        }
        return [matchResult, matchValue];
    }

    // 任务失败处理逻辑
    async _handleTaskFailure(task, error) {
        logTaskEvent(error);
        const maxRetries = ConfigService.getConfigValue('task.maxRetries');
        const retryInterval = ConfigService.getConfigValue('task.retryInterval');
        
        // 初始化重试次数
        if (!task.retryCount) {
            task.retryCount = 0;
        }
        
        if (task.retryCount < maxRetries) {
            task.retryCount++;
            task.status = 'pending';
            task.lastError = `${error.message} (重试 ${task.retryCount}/${maxRetries})`;
            // 设置下次重试时间
            task.nextRetryTime = new Date(Date.now() + retryInterval * 1000);
            logTaskEvent(`任务将在 ${retryInterval} 秒后重试 (${task.retryCount}/${maxRetries})`);
        } else {
            task.status = 'failed';
            task.lastError = `${error.message} (已达到最大重试次数 ${maxRetries})`;
            logTaskEvent(`任务达到最大重试次数 ${maxRetries}，标记为失败`);
        }
        
        await this.taskRepo.save(task);
        return '';
    }

     // 获取需要重试的任务
     async getRetryTasks() {
        const now = new Date();
        return await this.taskRepo.find({
            where: {
                status: 'pending',
                nextRetryTime: LessThan(now),
                retryCount: LessThan(ConfigService.getConfigValue('task.maxRetries'))
            }
        });
    }

    // 处理重试任务
    async processRetryTasks() {
        const retryTasks = await this.getRetryTasks();
        if (retryTasks.length === 0) {
            return [];
        }
        let saveResults = [];
        
        for (const task of retryTasks) {
            logTaskEvent(`开始重试任务 ${task.name}`);
            try {
                const result = await this.processTask(task);
                if (result) {
                    saveResults.push(result);
                }
            } catch (error) {
                console.error(`重试任务${task.name}执行失败:`, error);
            }
            // 任务间隔
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (saveResults.length > 0) {
            this.messageUtil.sendMessage(saveResults.join("\n\n"));
        }
        return saveResults;
    }
    // 创建批量任务
    async createBatchTask(cloud189, batchTaskDto) {
        const resp = await cloud189.createBatchTask(batchTaskDto);
        if (!resp) {
            throw new Error('批量任务处理失败');
        }
        if (resp.res_code != 0) {
            throw new Error(resp.res_msg);
        }
        if (!await this.checkTaskStatus(cloud189,resp.taskId, 0 , batchTaskDto.type)) {
            throw new Error('批量任务处理失败');
        }
    }
    // 定时清空回收站
    async clearRecycleBin() {
        const autoClearRecycle  = ConfigService.getConfigValue('task.enableAutoClearRecycle')
        if (!autoClearRecycle) {
            return
        }
        const accounts = await this.accountRepo.find()
        if (accounts) {
            for (const account of accounts) {
                try {
                    const cloud189 = Cloud189Service.getInstance(account);    
                    const batchTaskDto = new BatchTaskDto({
                        taskInfos: '[]',
                        type: 'EMPTY_RECYCLE'
                    });
                    await this.createBatchTask(cloud189, batchTaskDto)
                } catch (error) {
                    console.error(`定时清空回收站任务执行失败:`, error);
                }
            }
        }
    }
}

module.exports = { TaskService };