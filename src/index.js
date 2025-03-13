require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const basicAuth = require('express-basic-auth');
const { AppDataSource } = require('./database');
const { Account, Task } = require('./entities');
const { TaskService } = require('./services/task');
const { Cloud189Service } = require('./services/cloud189');
const { WeworkService } = require('./services/wework');

const app = express();
app.use(express.json());
app.use(express.static('src/public'));

// 添加HTTP基本认证
app.use(basicAuth({
    users: { [process.env.AUTH_USERNAME]: process.env.AUTH_PASSWORD },
    challenge: true,
    realm: encodeURIComponent('天翼云盘自动转存系统')
}));

// 初始化数据库连接
AppDataSource.initialize().then(() => {
    console.log('数据库连接成功');
    const accountRepo = AppDataSource.getRepository(Account);
    const taskRepo = AppDataSource.getRepository(Task);
    const taskService = new TaskService(taskRepo, accountRepo);
    const webhook = new WeworkService(process.env.WECOM_WEBHOOK);
    // 账号相关API
    app.get('/api/accounts', async (req, res) => {
        const accounts = await accountRepo.find();
        res.json({ success: true, data: accounts });
    });

    app.post('/api/accounts', async (req, res) => {
        try {
            const account = accountRepo.create(req.body);
            await accountRepo.save(account);
            res.json({ success: true, data: account });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/accounts/:id', async (req, res) => {
        try {
            const account = await accountRepo.findOneBy({ id: parseInt(req.params.id) });
            if (!account) throw new Error('账号不存在');
            await accountRepo.remove(account);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    // 任务相关API
    app.get('/api/tasks', async (req, res) => {
        const tasks = await taskRepo.find({
            order: { id: 'DESC' }
        });
        res.json({ success: true, data: tasks });
    });

    app.post('/api/tasks', async (req, res) => {
        try {
            const { accountId, shareLink, targetFolderId, videoType, totalEpisodes } = req.body;
            const task = await taskService.createTask(accountId, shareLink, targetFolderId, videoType, totalEpisodes);
            res.json({ success: true, data: task });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/tasks/:id', async (req, res) => {
        try {
            await taskService.deleteTask(parseInt(req.params.id));
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.put('/api/tasks/:id', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            const { resourceName, videoType, realFolderId, currentEpisodes, totalEpisodes, status, shareFolderName, shareFolderId } = req.body;
            const updates = { resourceName, videoType, realFolderId, currentEpisodes, totalEpisodes, status, shareFolderName, shareFolderId };
            const updatedTask = await taskService.updateTask(taskId, updates);
            res.json({ success: true, data: updatedTask });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.post('/api/tasks/:id/execute', async (req, res) => {
        try {
            const task = await taskRepo.findOneBy({ id: parseInt(req.params.id) });
            if (!task) throw new Error('任务不存在');
            const result = await taskService.processTask(task);
            if (result) {
                webhook.sendMessage(result)
            }
            res.json({ success: true, data: result });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

     // 获取目录树
     app.get('/api/folders/:accountId', async (req, res) => {
        try {
            const accountId = parseInt(req.params.accountId);
            const folderId = req.query.folderId || '-11';
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }

            const cloud189 = Cloud189Service.getInstance(account);
            const folders = await cloud189.getFolderNodes(folderId);
            res.json({ success: true, data: folders });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 根据分享链接获取文件目录
    app.get('/api/share/folders/:accountId', async (req, res) => {
        try {
            const shareLink = req.query.shareLink;
            const accountId = req.params.accountId;
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            const shareInfo = await taskService.parseShareLink(cloud189, shareLink);
            if (!shareInfo || !shareInfo.shareId) throw new Error('获取分享信息失败');
            if (req.query.folderId == -11) {
                // 返回顶级目录
                res.json({success: true, data: [{id: shareInfo.fileId, name: shareInfo.fileName}]});
                return 
            }
            // 查询分享目录
            const shareDir = await cloud189.listShareDir(shareInfo.shareId, req.query.folderId, shareInfo.shareMode);
            if (!shareDir || !shareDir.fileListAO) {
                res.json({ success: true, data: [] });    
            }
            res.json({ success: true, data: shareDir.fileListAO.folderList });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 启动定时任务
    cron.schedule(process.env.TASK_CHECK_INTERVAL, async () => {
        console.log('执行定时任务检查...');
        const tasks = await taskService.getPendingTasks();
        let saveResults = []
        for (const task of tasks) {
            try {
            result = await taskService.processTask(task);
            if (result) {
                saveResults.push(result)
            }
            } catch (error) {
                console.error(`任务${task.id}执行失败:`, error);
            }
        }
        if (saveResults.length > 0) {
            webhook.sendMessage(saveResults.join("\n"))
        }
    });

    // 启动服务器
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`服务器运行在 http://localhost:${port}`);
    });
}).catch(error => {
    console.error('数据库连接失败:', error);
});