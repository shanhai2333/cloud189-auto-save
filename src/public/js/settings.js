async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        if (data.success) {
            const settings = data.data;
            // 任务设置
            document.getElementById('taskExpireDays').value = settings.task?.taskExpireDays || 3;
            document.getElementById('taskMaxRetries').value = settings.task?.taskMaxRetries || 3;
            document.getElementById('taskRetryInterval').value = settings.task?.taskRetryInterval || 300;

            // 企业微信设置
            document.getElementById('enableWecom').checked = settings.wecom?.enable || false;
            document.getElementById('wecomWebhook').value = settings.wecom?.webhook || '';
            
            // Telegram 设置
            document.getElementById('enableTelegram').checked = settings.telegram?.enable || false;
            document.getElementById('proxyDomain').value = settings.telegram?.proxyDomain || '';
            document.getElementById('telegramBotToken').value = settings.telegram?.botToken || '';
            document.getElementById('telegramChatId').value = settings.telegram?.chatId || '';
            
            // WXPusher 设置
            document.getElementById('enableWXPusher').checked = settings.wxpusher?.enable || false;
            document.getElementById('wXPusherSPT').value = settings.wxpusher?.spt || '';
            
            // 代理设置
            document.getElementById('proxyHost').value = settings.proxy?.host || '';
            document.getElementById('proxyPort').value = settings.proxy?.port || '';
            document.getElementById('proxyUsername').value = settings.proxy?.username || '';
            document.getElementById('proxyPassword').value = settings.proxy?.password || '';

            // Bark 设置
            document.getElementById('enableBark').checked = settings.bark?.enable || false;
            document.getElementById('barkServerUrl').value = settings.bark?.serverUrl || '';
            document.getElementById('barkKey').value = settings.bark?.key || '';
            
        }
    } catch (error) {
        console.error('加载设置失败:', error);
    }
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const settings = {
        task: {
            taskExpireDays: parseInt(document.getElementById('taskExpireDays').value) || 3,
            taskMaxRetries: parseInt(document.getElementById('taskMaxRetries').value) || 3,
            taskRetryInterval: parseInt(document.getElementById('taskRetryInterval').value) || 300
        },
        wecom: {
            enable: document.getElementById('enableWecom').checked,
            webhook: document.getElementById('wecomWebhook').value
        },
        telegram: {
            enable: document.getElementById('enableTelegram').checked,
            proxyDomain: document.getElementById('proxyDomain').value,
            botToken: document.getElementById('telegramBotToken').value,
            chatId: document.getElementById('telegramChatId').value
        },
        wxpusher: {
            enable: document.getElementById('enableWXPusher').checked,
            spt: document.getElementById('wXPusherSPT').value
        },
        proxy: {
            host: document.getElementById('proxyHost').value,
            port: parseInt(document.getElementById('proxyPort').value) || 0,
            username: document.getElementById('proxyUsername').value,
            password: document.getElementById('proxyPassword').value
        },
        bark: {
            enable: document.getElementById('enableBark').checked,
            serverUrl: document.getElementById('barkServerUrl').value,
            key: document.getElementById('barkKey').value
        }
    };
    // taskRetryInterval不能少于60秒
    if (settings.task.taskRetryInterval < 60) {
        alert("任务重试间隔不能小于60秒")
        return 
    }

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        const data = await response.json();
        if (data.success) {
            alert('设置保存成功');
        } else {
            alert('设置保存失败: ' + data.error);
        }
    } catch (error) {
        alert('设置保存失败: ' + error.message);
    }
});

// 在页面加载时初始化设置
document.addEventListener('DOMContentLoaded', loadSettings);