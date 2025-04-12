const TelegramBot = require('node-telegram-bot-api');
const { AppDataSource } = require('../database');
const { Task, Account, CommonFolder } = require('../entities');
const { TaskService } = require('./task');
const { EmbyService } = require('./emby');

class TelegramBotService {
    constructor(token) {
        this.bot = new TelegramBot(token, { polling: true });
        this.accountRepo = AppDataSource.getRepository(Account);
        this.commonFolderRepo = AppDataSource.getRepository(CommonFolder);
        this.taskRepo = AppDataSource.getRepository(Task);
        this.taskService = new TaskService(this.taskRepo, this.accountRepo);
        this.currentAccountId = null;
        this.currentShareLink = null;
        this.currentAccessCode = null;
        this.initCommands();
    }

    initCommands() {
        this.bot.onText(/cloud\.189\.cn/, async (msg) => {
            const chatId = msg.chat.id;
            let shareLink = msg.text;
            
            let accessCode
            // 需要验证shareLink是否包含访问码
            if (shareLink.includes('访问码：')) {
                // 验证并解析分享链接
                const regex = /^(https:\/\/cloud\.189\.cn\/t\/[a-zA-Z0-9]+)(?:\s*（访问码：([a-zA-Z0-9]+)）)?$/;
                const linkMatch = regex.exec(shareLink);
                if (!linkMatch) {
                    return this.bot.sendMessage(chatId, '无效的天翼云盘分享链接');
                }
                shareLink = linkMatch[1];
                accessCode = linkMatch[2] || '';
            }
        
            try {
                // 如果没有选中账号，自动选择第一个可用账号
                if (!this.currentAccountId) {
                    const firstAccount = await this.accountRepo.findOne({ where: { isActive: true } });
                    if (!firstAccount) {
                        return this.bot.sendMessage(chatId, '未找到可用账号');
                    }
                    this.currentAccountId = firstAccount.id;
                }
                await this.handleFolderSelection(chatId, shareLink, null, accessCode);
            } catch (error) {
                this.bot.sendMessage(chatId, `处理失败: ${error.message}`);
            }
        });


        // 添加账号列表命令
        this.bot.onText(/\/accounts/, async (msg) => {
            await this.showAccounts(msg.chat.id);
        });

        // 添加任务列表命令
        this.bot.onText(/\/tasks/, async (msg) => {
            await this.showTasks(msg.chat.id);
        });

        // 生成strm
        this.bot.onText(/\/strm_(\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const taskId = match[1];
            if(!this._checkTaskId(taskId)) return;
            const task = await this.taskService.getTaskById(taskId);
            if (!task) {
                await this.bot.sendMessage(chatId, '未找到该任务');
                return;
            }
            const message = await this.bot.sendMessage(chatId, '开始生成strm...');
            try{
                this.taskService._createStrmFileByTask(task, true);
            }catch(e){
                await this.bot.sendMessage(chatId, `生成strm失败: ${e.message}`);
                return;
            }
            // 删除消息
            await this.bot.deleteMessage(chatId, message.message_id);
        })
        // 通知emby
        this.bot.onText(/\/emby_(\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const taskId = match[1];
            if(!this._checkTaskId(taskId)) return;
            const task = await this.taskService.getTaskById(taskId);
            if (!task) {
                await this.bot.sendMessage(chatId, '未找到该任务');
                return;
            }
            const message = await this.bot.sendMessage(chatId, '开始通知emby...');
            try{
                const embyService = new EmbyService()                
                await embyService.notify(task)
                // 删除消息
            await this.bot.deleteMessage(chatId, message.message_id);
            }catch(e){
                await this.bot.sendMessage(chatId, `通知失败: ${e.message}`);
                return;
            }
        })
        // 添加删除任务命令
        this.bot.onText(/\/deletetask_(\d+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const taskId = match[1];
            const keyboard = [
                [
                    { text: '是', callback_data: JSON.stringify({ t: 'dt', i: taskId, c: true, df: true }) },
                    { text: '否', callback_data: JSON.stringify({ t: 'dt', i: taskId, c: true, df: false }) }
                ],
                [{ text: '取消', callback_data: JSON.stringify({ t: 'dt', c: false }) }]
            ];
            await this.bot.sendMessage(chatId, '是否同步删除网盘文件？', {
                reply_markup: { inline_keyboard: keyboard }
            });
        });
        // 修改回调处理
        this.bot.on('callback_query', async (callbackQuery) => {
            const data = JSON.parse(callbackQuery.data);
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;


            try {
                switch (data.t) {
                    case 'f': // 文件夹选择
                        await this.createTask(chatId, data, messageId);
                        break;
                    case 'of': // 覆盖文件夹
                        if (!data.o) {
                            await this.bot.editMessageText("已取消任务创建",{
                                chat_id: chatId,
                                message_id: messageId
                            });
                            return;
                        }
                        await this.createTask(chatId, data, messageId);
                        break;
                    case 'sa': // 设置当前账号
                        await this.setCurrentAccount(chatId, data, messageId);
                        break;
                    case 'tp': // 任务分页
                        await this.showTasks(chatId, data.p, messageId);
                        break;
                    case 'dt': // 删除任务
                        if (!data.c) {
                            await this.bot.editMessageText("已取消删除",{
                                chat_id: chatId,
                                message_id: messageId
                            });
                            return;
                        }
                        await this.deleteTask(chatId, data, messageId);
                        break;
                }
            } catch (error) {
                this.bot.sendMessage(chatId, `处理失败: ${error.message}`);
            }
        });
    }

    async showAccounts(chatId, messageId = null) {
        const accounts = await this.accountRepo.find();
        const keyboard = accounts.map(account => [{
            text: `${account.username.slice(0, 3)}***${account.username.slice(-3)} ${account.id === this.currentAccountId ? '✅' : ''}`,
            callback_data: JSON.stringify({ t: 'sa', i: account.id, a: `${account.username.slice(0, 3)}***${account.username.slice(-3)}` })
        }]);

        const message = '账号列表 (✅表示当前选中账号):';
        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await this.bot.sendMessage(chatId, message, {
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    }

    async showTasks(chatId, page = 1, messageId = null) {
        const pageSize = 5;
        const skip = (page - 1) * pageSize;
        
        const [tasks, total] = await this.taskRepo.findAndCount({
            order: { updatedAt: 'DESC' },
            take: pageSize,
            skip: skip
        });

        const totalPages = Math.ceil(total / pageSize);
        
        const taskList = tasks.map(task => 
            `📺 ${task.resourceName}\n` +
            `⏱ 进度：${task.currentEpisodes}${task.totalEpisodes ? '/' + task.totalEpisodes : ''} 集\n` +
            `🔄 状态：${this.formatStatus(task.status)}\n` +
            `⌚️ 更新：${new Date(task.lastFileUpdateTime).toLocaleString('zh-CN')}\n` +
            `📁 STRM：/strm_${task.id}\n` +
            `🎬 Emby：/emby_${task.id}\n` +
            `❌ 删除: /deletetask_${task.id}`
        ).join('\n\n');

        const keyboard = [];

        // 添加分页按钮
        if (totalPages > 1) {
            const pageButtons = [];
            if (page > 1) {
                pageButtons.push({
                    text: '⬅️',
                    callback_data: JSON.stringify({ t: 'tp', p: page - 1 })
                });
            }
            pageButtons.push({
                text: `${page}/${totalPages}`,
                callback_data: JSON.stringify({ t: 'tp', p: page })
            });
            if (page < totalPages) {
                pageButtons.push({
                    text: '➡️',
                    callback_data: JSON.stringify({ t: 'tp', p: page + 1 })
                });
            }
            keyboard.push(pageButtons);
        }

        const message = tasks.length > 0 ? 
            `📋 任务列表 (第${page}页):\n\n${taskList}` : 
            '📭 暂无任务';

        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        } else {
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    }

    formatStatus(status) {
        const statusMap = {
            'pending': '⏳ 待处理',
            'processing': '🔄 处理中',
            'completed': '✅ 已完成',
            'failed': '❌ 失败'
        };
        return statusMap[status] || status;
    }

    async setCurrentAccount(chatId, data, messageId) {
        try {
            const accountId = data.i;
            if (this.currentAccountId == accountId) {
                await this.bot.sendMessage(chatId, `账号[${data.a}]已被选中`);
                await this.bot.deleteMessage(chatId, messageId);
                return;
            } 
            this.currentAccountId = accountId;
            // 获取账号信息
            const account = await this.accountRepo.findOneBy({ id: accountId });
            if (!account) {
                await this.bot.sendMessage(chatId, '未找到该账号');
            }
            // 删除原消息
            await this.bot.deleteMessage(chatId, messageId);
            // 发送新的文本消息
            const username = `${account.username.slice(0, 3)}***${account.username.slice(-3)}`;
            await this.bot.sendMessage(chatId, `已选择账号: ${username}`);

        } catch (error) {
            this.bot.sendMessage(chatId, `设置当前账号失败: ${error.message}`);
        }
    }

    async handleFolderSelection(chatId, shareLink, messageId = null,accessCode) {
        const folders = await this.commonFolderRepo.find({ where: { accountId: this.currentAccountId } });
        
        if (folders.length === 0) {
            const message = '未找到常用目录，请先在网页端配置';
            if (messageId) {
                await this.bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId
                });
            } else {
                await this.bot.sendMessage(chatId, message);
            }
            return;
        }
        // 缓存当前分享信息
        this.currentShareLink = shareLink;
        this.currentAccessCode = accessCode;
        const keyboard = folders.map(folder => [{
            text: folder.name,
            callback_data: JSON.stringify({
                t: 'f',               // type
                f: folder.id,   // folderId
            })
        }]);

        const message = '请选择保存目录:';
        if (messageId) {
            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        } else {
            await this.bot.sendMessage(chatId, message, {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }
    }

    async createTask(chatId, data, messageId) {
        try {
            const targetFolderId = data.f;
            // 根据targetFolderId查询出folderName
            const targetFolder = await this.commonFolderRepo.findOne({ where: { id: targetFolderId } });
            if (!targetFolder) {
                await this.bot.sendMessage(chatId, '未找到该目录');
                return
            }
            // 发送任务创建中消息
            const message = await this.bot.editMessageText('任务创建中...',{
                chat_id: chatId,
                message_id: messageId
            });
            const taskDto = {
                accountId: this.currentAccountId,
                shareLink: this.currentShareLink,
                targetFolderId: targetFolderId,
                targetFolder: targetFolder.path,
                tgbot: true,
                overwriteFolder: data?.o,
            };
            const tasks = await this.taskService.createTask(taskDto);
            // 遍历获取task.id
            const taskIds = tasks.map(task => task.id);
            this.bot.editMessageText('任务创建成功, 执行中...', {
                chat_id: chatId,
                message_id: message.message_id
            });
            if(taskIds.length > 0) {
                await this.taskService.processAllTasks(true, taskIds)   
            }
            this.bot.editMessageText('任务执行完成', {
                chat_id: chatId,
                message_id: message.message_id
            });
            // 清空缓存
            this.currentShareLink = null;
            this.currentAccessCode = null;
        } catch (error) {
            // 如果报错是 folder already exists 则提示用户是否需要覆盖
            if (error.message.includes('folder already exists')) {
                const keyboard = [
                    [{ text: '是', callback_data: JSON.stringify({ t: 'of', f: data.f, o: true }) }],
                    [{ text: '否', callback_data: JSON.stringify({ t: 'of', f: data.f, o: false }) }]
                ];
                await this.bot.editMessageText('该目录下已有同名文件夹，是否覆盖？', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
                return;
            }else{
                await this.bot.editMessageText(`任务创建失败: ${error.message}`, {
                    chat_id: chatId,
                    message_id: messageId
                });
                // 清空缓存
                this.currentShareLink = null;
                this.currentAccessCode = null;
                return;
            }
        }
    }

    async deleteTask(chatId,data,messageId) {
        try{
            // 判断data.i是否为数字
            if(isNaN(data.i)) {
                await this.bot.editMessageText('任务ID无效', {
                    chat_id: chatId,
                    message_id: messageId
                });
                return;
            }
            // 发送任务删除中消息
            await this.bot.editMessageText('任务删除中...',{
                chat_id: chatId,
                message_id: messageId
            });

            await this.taskService.deleteTask(parseInt(data.i), data.df);
            await this.bot.editMessageText('任务删除成功', {
                chat_id: chatId,
                message_id: messageId
            });
            // 刷新任务列表
            setTimeout(() => this.showTasks(chatId, 1, messageId), 800);
        }catch(e) {
            this.bot.editMessageText(`任务删除失败: ${e.message}`, {
                chat_id: chatId,
                message_id: messageId
            });
        }
    }

    // 校验任务id
    _checkTaskId(taskId) {
        if(isNaN(taskId)) {
            this.bot.editMessageText('任务ID无效', {
                chat_id: chatId,
                message_id: messageId
            });
            return false;
        }
        return true;
    }
}

module.exports = { TelegramBotService };