const messageManager = require('./message/MessageManager');

class MessageUtil {
    constructor() {
        // 初始化消息推送配置
        messageManager.initialize({
            wework: {
                enabled: process.env.WECOM_ENABLED === 'true',
                webhook: process.env.WECOM_WEBHOOK
            },
            telegram: {
                enabled: process.env.TELEGRAM_ENABLED === 'true',
                botToken: process.env.TELEGRAM_BOT_TOKEN,
                chatId: process.env.TELEGRAM_CHAT_ID,
                proxy: {
                    type: process.env.PROXY_TYPE,
                    host: process.env.PROXY_HOST,
                    port: process.env.PROXY_PORT,
                    username: process.env.PROXY_USERNAME,
                    password: process.env.PROXY_PASSWORD
                },
                cfProxyDomain: process.env.CF_PROXY_DOMAIN
            },
            wxpusher: {
                enabled: process.env.WXPUSHER_ENABLED === 'true',
                spt: process.env.WXPUSHER_SPT
            }
        });
    }

    // 发送消息
    async sendMessage(message) {
        await messageManager.sendMessage(message);
    }
}

module.exports = { MessageUtil };