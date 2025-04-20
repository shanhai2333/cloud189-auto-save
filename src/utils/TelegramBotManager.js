const { TelegramBotService } = require('../services/telegramBot');
const { logTaskEvent } = require('./logUtils');

class TelegramBotManager {
    static instance = null;
    static bot = null;

    static getInstance() {
        if (!TelegramBotManager.instance) {
            TelegramBotManager.instance = new TelegramBotManager();
        }
        return TelegramBotManager.instance;
    }

    async handleBotStatus(botToken, enable) {
        const shouldEnableBot = enable && botToken;
        const botTokenChanged = TelegramBotManager.bot?.token !== botToken;

        if (TelegramBotManager.bot && (!shouldEnableBot || botTokenChanged)) {
            TelegramBotManager.bot.stop();
            TelegramBotManager.bot = null;
            logTaskEvent(`Telegram机器人已停用`);
        }

        if (shouldEnableBot && (!TelegramBotManager.bot || botTokenChanged)) {
            TelegramBotManager.bot = new TelegramBotService(botToken);
            TelegramBotManager.bot.start()
            .then(() => {
                logTaskEvent(`Telegram机器人已启动`);
            })
            .catch(error => {
                logTaskEvent(`Telegram机器人启动失败: ${error.message}`);
            });
        }
    }

    getBot() {
        return TelegramBotManager.bot;
    }
}

module.exports = TelegramBotManager;