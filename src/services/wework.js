const got = require('got');
class WeworkService {
    constructor(webhook) {
        this.webhook = webhook;
    }

    // 发送文本消息
    async sendMessage(message) {
        if(this.webhook) {
            try {
            
                const response = await got.post(this.webhook, {
                    json: {
                        msgtype: 'markdown',
                        markdown: {
                            content: message
                        }
                    }
                }).json();
                if (response.errcode !== 0) {
                    console.error('企业微信消息推送失败:', response.errmsg);
                }
            } catch (error) {
                console.error('企业微信消息推送异常:', error);
            } 
        }
        this.sendTelegramMessage(message)
        
    }
    // 发送Telegram消息
    async sendTelegramMessage(message) {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        const proxyType = process.env.PROXY_TYPE || 'http';
        const proxyHost = process.env.PROXY_HOST;
        const proxyPort = process.env.PROXY_PORT;
        const proxyUsername = process.env.PROXY_USERNAME;
        const proxyPassword = process.env.PROXY_PASSWORD;

        if (!botToken || !chatId) {
            console.error('Telegram消息推送配置错误');
            return false;
        }

        try {
            // 转换消息格式为 Telegram Markdown
            let telegramMessage = message
            // 加粗标题
            .replace(/^(.*?)更新/gm, '🎉*$1*更新')
            // 移除 HTML 标签并转换为 Telegram 代码格式
            .replace(/<font color="warning">/g, '`')
            .replace(/<\/font>/g, '`')
            // 替换引用格式为列表项（确保在新行开始）
            .replace(/>\s*/g, '   - ');
            const requestOptions = {
                json: {
                    chat_id: chatId,
                    text: telegramMessage,
                    parse_mode: 'Markdown'
                }
            };

            // 如果配置了代理，添加代理设置
            if (proxyHost && proxyPort) {
                let proxyUrl = `${proxyType}://${proxyHost}:${proxyPort}`;
                // 如果配置了代理认证信息，添加到URL中
                if (proxyUsername && proxyPassword) {
                    proxyUrl = `${proxyType}://${encodeURIComponent(proxyUsername)}:${encodeURIComponent(proxyPassword)}@${proxyHost}:${proxyPort}`;
                }
                console.log(proxyUrl)
                requestOptions.proxy = proxyUrl
            }
            // 5秒超时
            requestOptions.timeout = {
                request: 5000
            }
            let apiUrl = `https://api.telegram.org`
            if (process.env.CF_PROXY_DOMAIN) {
                requestOptions.proxy = false
                apiUrl = process.env.CF_PROXY_DOMAIN
            }
            
            const response = await got.post(`${apiUrl}/bot${botToken}/sendMessage`, {...requestOptions}).json();
            if (!response.ok) {
                console.error('Telegram消息推送失败:', response.description);
                return false;
            }
            return true;
        } catch (error) {
            console.error('Telegram消息推送异常:', error);
            return false;
        }
    }
}

module.exports = { WeworkService };