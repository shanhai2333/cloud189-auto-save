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
            await TelegramBotManager.bot.stop();
            TelegramBotManager.bot = null;
            logTaskEvent(`Telegram机器人已停用`);
        }

        if (shouldEnableBot && (!TelegramBotManager.bot || botTokenChanged)) {
            TelegramBotManager.bot = new TelegramBotService(botToken);
            await TelegramBotManager.bot.start();
            logTaskEvent(`Telegram机器人已启用`);
        }
    }

    getBot() {
        return TelegramBotManager.bot;
    }
}

module.exports = TelegramBotManager;