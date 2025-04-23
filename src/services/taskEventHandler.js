const { StrmService } = require('./strm');
const { EmbyService } = require('./emby');
const { logTaskEvent } = require('../utils/logUtils');
const ConfigService = require('./ConfigService');
const { ScrapeService } = require('./ScrapeService');

class TaskEventHandler {
    constructor(messageUtil) {
        this.messageUtil = messageUtil;
    }

    async handle(taskCompleteEventDto) {
        const task = taskCompleteEventDto.task;
        logTaskEvent(` ${task.resourceName} 触发事件:`);
        try {
            // 执行重命名操作
            const newFiles = await taskCompleteEventDto.taskService.autoRename(taskCompleteEventDto.cloud189, task);
            if (newFiles.length > 0) {
                taskCompleteEventDto.fileList = newFiles;
            }
            const strmService = new StrmService();
            if (ConfigService.getConfigValue('strm.enable')) {
                const message = await strmService.generate(task, taskCompleteEventDto.fileList, taskCompleteEventDto.overwriteStrm);
                this.messageUtil.sendMessage(message);
            }
            // 如果开启了刮削
            if (ConfigService.getConfigValue('tmdb.enableScraper') && task?.enableTaskScraper) {
                const strmPath = strmService.getStrmPath(task);
                if (strmPath)  {
                const scrapeService = new ScrapeService();
                    logTaskEvent(`开始刮削tmdbId: ${task.tmdbId}的媒体信息, 路径: ${strmPath}`);
                    const mediaDetails = await scrapeService.scrapeFromDirectory(strmPath, task.tmdbId);
                    if (mediaDetails) {
                        // 保存到数据库
                        if (task.tmdbId != mediaDetails.tmdbId) {
                            await taskCompleteEventDto.taskRepo.update(task.id, {
                                tmdbId: mediaDetails.tmdbId,
                                tmdbContent: JSON.stringify(mediaDetails)
                            });
                        }
                        //  发送刮削成功的海报(backdropPath)到消息, 简要描述(), 评分(voteAverage)
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

            if (ConfigService.getConfigValue('emby.enable')) {
                const embyService = new EmbyService();
                await embyService.notify(task);
            }
        } catch (error) {
            console.error(error);
            logTaskEvent(`任务完成后处理失败: ${error.message}`);
        }
        logTaskEvent(`================事件处理完成================`);
    }
}

module.exports = { TaskEventHandler };