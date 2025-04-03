const cron = require('node-cron');
const ConfigService = require('./ConfigService');
const { logTaskEvent } = require('../utils/logUtils');

class SchedulerService {
    static taskJobs = new Map();

    static async initTaskJobs(taskRepo, taskService) {
        // 初始化所有启用定时任务的任务
        const tasks = await taskRepo.find({ where: { enableCron: true } });
        tasks.forEach(task => {
            this.saveTaskJob(task, taskService);
        });

        logTaskEvent("初始化系统定时任务...")
        // 初始化系统定时任务
        // 1. 默认定时任务检查 默认19-23点执行一次
        this.saveDefaultTaskJob('任务定时检查', ConfigService.getConfigValue('task.taskCheckCron') , async () => {
            taskService.processAllTasks();
        });
        // 2. 重试任务检查 默认每分钟执行一次
        this.saveDefaultTaskJob('重试任务检查', '*/1 * * * *', async () => {
            await taskService.processRetryTasks();
        });
        // 3. 清空回收站 默认每8小时执行一次
        const enableAutoClearRecycle = ConfigService.getConfigValue('task.enableAutoClearRecycle');
        if (enableAutoClearRecycle) {
            this.saveDefaultTaskJob('自动清空回收站',  ConfigService.getConfigValue('task.cleanRecycleCron'), async () => {
                await taskService.clearRecycleBin();
            })
        }
    }

    static saveTaskJob(task, taskService) {
        if (this.taskJobs.has(task.id)) {
            this.taskJobs.get(task.id).stop();
        }
        const taskName = task.shareFolderName?(task.resourceName + '/' + task.shareFolderName): task.resourceName || '未知'
        // 校验表达式是否有效
        if (!cron.validate(task.cronExpression)) {
            logTaskEvent(`定时任务[${taskName}]表达式无效，跳过...`);
            return;
        }
        if (task.enableCron && task.cronExpression) {
            logTaskEvent(`创建定时任务 ${taskName}, 表达式: ${task.cronExpression}`)
            const job = cron.schedule(task.cronExpression, async () => {
                logTaskEvent(`执行任务[${task.id}]定时检查...`);
                await taskService.processTask(task);
            });
            this.taskJobs.set(task.id, job);
        }
    }

    // 内置定时任务
    static saveDefaultTaskJob(name, cronExpression, task) {
        if (this.taskJobs.has(name)) {
            this.taskJobs.get(name).stop();
        }
        // 校验表达式是否有效
        if (!cron.validate(cronExpression)) {
            logTaskEvent(`定时任务[${name}]表达式无效，跳过...`);
            return;
        }
        const job = cron.schedule(cronExpression, task);
        this.taskJobs.set(name, job);
        return job;
    }

    static removeTaskJob(taskId) {
        if (this.taskJobs.has(taskId)) {
            this.taskJobs.get(taskId).stop();
            this.taskJobs.delete(taskId);
        }
    }
}

module.exports = { SchedulerService };