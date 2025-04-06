require('dotenv').config();
const express = require('express');
const { AppDataSource } = require('./database');
const { Account, Task } = require('./entities');
const { TaskService } = require('./services/task');
const { Cloud189Service } = require('./services/cloud189');
const { MessageUtil } = require('./services/message');
const { CacheManager } = require('./services/CacheManager')
const ConfigService = require('./services/ConfigService');
const packageJson = require('../package.json');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const { SchedulerService } = require('./services/scheduler');

const app = express();
app.use(express.json());

app.use(session({
    store: new FileStore({
        path: './data/sessions',  // session文件存储路径
        ttl: 30 * 24 * 60 * 60,  // session过期时间，单位秒
        reapInterval: 3600,       // 清理过期session间隔，单位秒
        retries: 0,           // 设置重试次数为0
        logFn: () => {},      // 禁用内部日志
        reapAsync: true,      // 异步清理过期session
    }),
    secret: process.env.SESSION_SECRET || 'LhX2IyUcMAz2',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000 * 30 // 30天
    }
}));

// 验证会话的中间件
const authenticateSession = (req, res, next) => {
    if (req.session.authenticated) {
        next();
    } else {
        // API 请求返回 401，页面请求重定向到登录页
        if (req.path.startsWith('/api/')) {
            res.status(401).json({ success: false, error: '未登录' });
        } else {
            res.redirect('/login');
        }
    }
};

// 添加根路径处理
app.get('/', (req, res) => {
    if (!req.session.authenticated) {
        res.redirect('/login');
    } else {
        res.sendFile(__dirname + '/public/index.html');
    }
});


// 登录页面
app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

// 登录接口
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === process.env.AUTH_USERNAME && 
        password === process.env.AUTH_PASSWORD) {
        req.session.authenticated = true;
        req.session.username = username;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: '用户名或密码错误' });
    }
});
app.use(express.static('src/public'));
// 为所有路由添加认证（除了登录页和登录接口）
app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/login' || req.path === '/api/auth/login' || req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico)$/)) {
        return next();
    }
    authenticateSession(req, res, next);
});
// 初始化数据库连接
AppDataSource.initialize().then(async () => {
    console.log('数据库连接成功');
    const accountRepo = AppDataSource.getRepository(Account);
    const taskRepo = AppDataSource.getRepository(Task);
    const taskService = new TaskService(taskRepo, accountRepo);
    const messageUtil = new MessageUtil();
    // 初始化缓存管理器
    const folderCache = new CacheManager(parseInt(process.env.FOLDER_CACHE_TTL || 600));
    
    // 初始化任务定时器
    await SchedulerService.initTaskJobs(taskRepo, taskService);
    
    // 账号相关API
    app.get('/api/accounts', async (req, res) => {
        const accounts = await accountRepo.find();
        // 获取容量
        for (const account of accounts) {
            const cloud189 = Cloud189Service.getInstance(account);
            const capacity = await cloud189.getUserSizeInfo()
            account.capacity = {
                cloudCapacityInfo: {usedSize:0,totalSize:0},
                familyCapacityInfo: {usedSize:0,totalSize:0}
            }
            if (capacity && capacity.res_code == 0) {
                account.capacity.cloudCapacityInfo = capacity.cloudCapacityInfo;
                account.capacity.familyCapacityInfo = capacity.familyCapacityInfo;
            }
            // username脱敏
            account.username = account.username.replace(/(.{3}).*(.{4})/, '$1****$2');
            // 去掉cookies和密码
            account.cookies = '';
            account.password = '';
        }
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

    // 修改账号cookie
    app.put('/api/accounts/:id/cookie', async (req, res) => {
        try {
            const accountId = parseInt(req.params.id);
            const { cookie } = req.body;
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) throw new Error('账号不存在');
            account.cookies = cookie;
            await accountRepo.save(account);
            res.json({ success: true });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    })

    // 任务相关API
    app.get('/api/tasks', async (req, res) => {
        const tasks = await taskRepo.find({
            order: { id: 'DESC' },
            relations: {
                account: true
            },
            select: {
                account: {
                    username: true
                }
            }
        });
        // username脱敏
        tasks.forEach(task => {
            task.account.username = task.account.username.replace(/(.{3}).*(.{4})/, '$1****$2');
        });
        res.json({ success: true, data: tasks });
    });

    app.post('/api/tasks', async (req, res) => {
        try {
            const task = await taskService.createTask(req.body);
            res.json({ success: true, data: task });
        } catch (error) {
            res.json({ success: false, error: error.message });
        }
    });

    app.delete('/api/tasks/batch', async (req, res) => {
        try {
            const taskIds = req.body.taskIds;
            await taskService.deleteTasks(taskIds);
            res.json({ success: true });
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
            const updatedTask = await taskService.updateTask(taskId, req.body);
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
                messageUtil.sendMessage(result)
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
            const forceRefresh = req.query.refresh === 'true';
            const cacheKey = `folders_${accountId}_${folderId}`;
            // forceRefresh 为true 则清空所有folders_开头的缓存
            if (forceRefresh) {
                folderCache.clearPrefix("folders_");
            }
            if (folderCache.has(cacheKey)) {
                return res.json({ success: true, data: folderCache.get(cacheKey) });
            }
            const account = await accountRepo.findOneBy({ id: accountId });
            if (!account) {
                throw new Error('账号不存在');
            }

            const cloud189 = Cloud189Service.getInstance(account);
            const folders = await cloud189.getFolderNodes(folderId);
            if (!folders) {
                throw new Error('获取目录失败');
            }
            folderCache.set(cacheKey, folders);
            res.json({ success: true, data: folders });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 根据分享链接获取文件目录
    app.get('/api/share/folders/:accountId', async (req, res) => {
        try {
            const taskId = parseInt(req.query.taskId);
            const folderId = req.query.folderId;
            const forceRefresh = req.query.refresh === 'true';
            const cacheKey = `share_folders_${taskId}_${folderId}`;
            if (forceRefresh) {
                folderCache.clearPrefix("share_folders_");
            }
            if (folderCache.has(cacheKey)) {
                return res.json({ success: true, data: folderCache.get(cacheKey) });
            }
            const task = await taskRepo.findOneBy({ id: parseInt(taskId) });
            if (!task) {
                throw new Error('任务不存在');
            }
            if (folderId == -11) {
                // 返回顶级目录
                res.json({success: true, data: [{id: task.shareFileId, name: task.resourceName}]});
                return 
            }
            const account = await accountRepo.findOneBy({ id: req.params.accountId });
            if (!account) {
                throw new Error('账号不存在');
            }
            const cloud189 = Cloud189Service.getInstance(account);
            // 查询分享目录
            const shareDir = await cloud189.listShareDir(task.shareId, req.query.folderId, task.shareMode);
            if (!shareDir || !shareDir.fileListAO) {
                res.json({ success: true, data: [] });    
            }
            const folders = shareDir.fileListAO.folderList;
            folderCache.set(cacheKey, folders);
            res.json({ success: true, data: folders });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

     // 获取目录下的文件
     app.get('/api/folder/files', async (req, res) => {
        const { accountId, folderId } = req.query;
        const account = await accountRepo.findOneBy({ id: accountId });
        if (!account) {
            throw new Error('账号不存在');
        }
        const cloud189 = Cloud189Service.getInstance(account);
        const fileList =  await taskService.getAllFolderFiles(cloud189, folderId);
        res.json({ success: true, data: fileList });
    });
    app.post('/api/files/rename', async (req, res) => {
        const {taskId, accountId, files, sourceRegex, targetRegex } = req.body;
        if (files.length == 0) {
            throw new Error('未获取到需要修改的文件');
        }
        const account = await accountRepo.findOneBy({ id: accountId });
        if (!account) {
            throw new Error('账号不存在');
        }
        const task = await taskRepo.findOneBy({ id: taskId });
        if (!task) {
            throw new Error('任务不存在');
        }
        const cloud189 = Cloud189Service.getInstance(account);
        const result = []
        for (const file of files) {
            const renameResult = await cloud189.renameFile(file.fileId, file.destFileName);
            if (!renameResult) {
                throw new Error('重命名失败');
            }
            if (renameResult.res_code != 0) {
                result.push(`文件${file.destFileName} ${renameResult.res_msg}`)
            }
        }
        if (sourceRegex && targetRegex) {
            task.sourceRegex = sourceRegex
            task.targetRegex = targetRegex
            taskRepo.save(task)
        }
        res.json({ success: true, data: result });
    });

    app.post('/api/tasks/executeAll', async (req, res) => {
        await taskService.processAllTasks();
        res.json({ success: true, data: null });
    });
    
    // 系统设置
    app.get('/api/settings', async (req, res) => {
        res.json({success: true, data: ConfigService.getConfig()})
    })

    app.post('/api/settings', async (req, res) => {
        const settings = req.body;
        SchedulerService.handleScheduleTasks(settings,taskService);
        ConfigService.setConfig(settings)
        // 修改配置, 重新实例化消息推送
        messageUtil.updateConfig()
        res.json({success: true, data: null})
    })

    app.get('/api/version', (req, res) => {
        res.json({ version: packageJson.version });
    });
    
    // 启动服务器
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`服务器运行在 http://localhost:${port}`);
    });
}).catch(error => {
    console.error('数据库连接失败:', error);
});
