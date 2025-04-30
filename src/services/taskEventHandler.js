const { StrmService } = require('./strm');
const { EmbyService } = require('./emby');
const { logTaskEvent } = require('../utils/logUtils');
const ConfigService = require('./ConfigService');
const { ScrapeService } = require('./ScrapeService');
const alistService = require('./alistService');
const path = require('path');

class TaskEventHandler {
    constructor(messageUtil) {
        this.messageUtil = messageUtil;
    }

    async handle(taskCompleteEventDto) {
        const task = taskCompleteEventDto.task;
        logTaskEvent(` ${task.resourceName} 触发事件:`);
        try {
            await this._handleAutoRename(taskCompleteEventDto);
            await this._handleStrmGeneration(taskCompleteEventDto);
            await this._handleAlistCache(taskCompleteEventDto);
            await this._handleMediaScraping(taskCompleteEventDto);
            this._handleEmbyNotification(taskCompleteEventDto)
        } catch (error) {
            console.error(error);
            logTaskEvent(`任务完成后处理失败: ${error.message}`);
        }
        logTaskEvent(`================事件处理完成================`);
    }
    async _handleAutoRename(taskCompleteEventDto) {
        try {
            const newFiles = await taskCompleteEventDto.taskService.autoRename(taskCompleteEventDto.cloud189, taskCompleteEventDto.task);
            if (newFiles.length > 0) {
                taskCompleteEventDto.fileList = newFiles;
            }
        } catch (error) {
            console.error(error);
            logTaskEvent(`自动重命名失败: ${error.message}`);
        }
    }

    async _handleStrmGeneration(taskCompleteEventDto) {
        try {
            const {task, fileList, overwriteStrm} = taskCompleteEventDto;
            const strmService = new StrmService();
            if (ConfigService.getConfigValue('strm.enable')) {
                const message = await strmService.generate(task, fileList, overwriteStrm);
                this.messageUtil.sendMessage(message);
            }
        } catch (error) {
            console.error(error);
            logTaskEvent(`生成STRM文件失败: ${error.message}`);
        }
    }

    async _handleAlistCache(taskCompleteEventDto) {
        try {
            const {task} = taskCompleteEventDto;
            if (ConfigService.getConfigValue('alist.enable') && !task.enableSystemProxy && task.account.cloudStrmPrefix) {
                const pathParts = task.realFolderName.split('/');
                let alistPath = pathParts.slice(1, -1).join('/');
                alistPath = path.join(path.basename(task.account.cloudStrmPrefix), alistPath)
                logTaskEvent(`刷新alist上级目录缓存: ${alistPath}`);
                await alistService.listFiles(alistPath);
                const currentPath = path.join(alistPath, path.basename(task.realFolderName))
                logTaskEvent(`刷新alist当前目录缓存: ${currentPath}`);
                await alistService.listFiles(currentPath);
            }
        } catch (error) {
            console.error(error);
            logTaskEvent(`刷新Alist缓存失败: ${error.message}`);
        }
    }

    async _handleMediaScraping(taskCompleteEventDto) {
        try {
            const {task, taskRepo} = taskCompleteEventDto;
            if (ConfigService.getConfigValue('tmdb.enableScraper') && task?.enableTaskScraper) {
                const strmService = new StrmService();
                const strmPath = strmService.getStrmPath(task);
                if (strmPath) {
                    const scrapeService = new ScrapeService();
                    logTaskEvent(`开始刮削tmdbId: ${task.tmdbId}的媒体信息, 路径: ${strmPath}`);
                    const mediaDetails = await scrapeService.scrapeFromDirectory(strmPath, task.tmdbId);
                    if (mediaDetails) {
                        if (task.tmdbId != mediaDetails.tmdbId) {
                            await taskRepo.update(task.id, {
                                tmdbId: mediaDetails.tmdbId,
                                tmdbContent: JSON.stringify(mediaDetails)
                            });
                        }
                        const shortOverview = mediaDetails.overview ? 
                            (mediaDetails.overview.length > 20 ? mediaDetails.overview.substring(0, 50) + '...' : mediaDetails.overview) : 
                            '暂无';
                        const message = {
                            title: `✅ 刮削成功：${mediaDetails.title}`,
                            image: mediaDetails.backdropPath,
                            description: shortOverview,
                            rating: mediaDetails.voteAverage,
                            type: mediaDetails.type
                        }
                        this.messageUtil.sendScrapeMessage(message);
                    }
                }
            }
        } catch (error) {
            console.error(error);
            logTaskEvent(`媒体刮削失败: ${error.message}`);
        }
    }

    async _handleEmbyNotification(taskCompleteEventDto) {
        try {
            const {task} = taskCompleteEventDto;
            if (ConfigService.getConfigValue('emby.enable')) {
                const embyService = new EmbyService();
                await embyService.notify(task);
            }
        } catch (error) {
            console.error(error);
            logTaskEvent(`通知Emby失败: ${error.message}`);
        }
    }
}

module.exports = { TaskEventHandler };