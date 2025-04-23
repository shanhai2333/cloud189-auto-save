document.addEventListener('DOMContentLoaded', async function () {
    const configNeededDiv = document.getElementById('config-needed');
    const transferFormDiv = document.getElementById('transfer-form');
    const goToConfigButton = document.getElementById('go-to-config');
    const viewConfigLink = document.getElementById('view-config');

    const { apiUrl, apiKey } = await new Promise((resolve) => {
        chrome.storage.sync.get(['apiUrl', 'apiKey'], resolve);
    });

    if (!apiUrl || !apiKey) {
        configNeededDiv.classList.remove('hidden');
        transferFormDiv.classList.add('hidden');
    } else {
        configNeededDiv.classList.add('hidden');
        transferFormDiv.classList.remove('hidden');

        const accountSelect = document.getElementById('account-select');
        const directorySelect = document.getElementById('directory-select');
        const transferButton = document.getElementById('transfer-button');
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const shareLink = tab.url;
        // 验证是否为天翼云盘分享链接
        if (!shareLink.includes('cloud.189.cn')) {
            transferButton.disabled = true;
            // 修改颜色为灰色
            transferButton.style.background = '#ccc'
            transferButton.style.cursor = 'not-allowed';
            transferButton.textContent = '无效链接';
            return;
        }

        async function loadDirectories(accountId) {
            try {
                const directoriesResponse = await fetch(`${apiUrl}/api/favorites/${accountId}`, {
                    headers: {
                        'x-api-key': `${apiKey}`
                    }
                });
                const directories = await directoriesResponse.json();
                if (!directories.success) {
                    alert("获取常用目录失败:" + directories.error)
                    return
                }
                // 清空现有目录选项
                directorySelect.innerHTML = '';
    
                directories.data.forEach((directory) => {
                    const option = document.createElement('option');
                    option.value = directory.id;
                    option.textContent = directory.path;
                    directorySelect.appendChild(option);
                });
            } catch (error) {
                alert('获取目录信息失败: ' + error.message);
            }
        }
        
        try {
            console.log(`${apiUrl}/api/accounts`)
            const accountsResponse = await fetch(`${apiUrl}/api/accounts`, {
                headers: {
                    'x-api-key': `${apiKey}`
                }
            });
            const accounts = await accountsResponse.json();
            if (!accounts.success) {
                alert("账号获取失败:" + data.error)
                return;
            }
            accounts.data.forEach((account, index) => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = account.username;
                if (index === 0) {
                    option.selected = true;
                }
                accountSelect.appendChild(option);
            });

            // 初始加载默认账号的目录
            const defaultAccountId = accountSelect.value;
            await loadDirectories(defaultAccountId);

            // 添加账号切换事件监听器
            accountSelect.addEventListener('change', async function () {
                const selectedAccountId = this.value;
                await loadDirectories(selectedAccountId);
            });

        } catch (error) {
            console.error(error);
            alert('获取账号或目录信息失败: ' + error.message);
        }

        transferButton.addEventListener('click', async function () {
            transferButton.disabled = true;
            const originalText = transferButton.textContent;
            transferButton.style.background = '#ccc'
            transferButton.style.cursor = 'not-allowed';
            transferButton.textContent = '转存中...';

            const selectedAccountId = accountSelect.value;
            const selectedDirectoryId = directorySelect.value;
            const selectedDirectoryName = directorySelect.options[directorySelect.selectedIndex].textContent;

            try {
                const taskBody = {
                    shareLink,
                    accountId: selectedAccountId,
                    targetFolderId: selectedDirectoryId,
                    targetFolder: selectedDirectoryName
                };
                await createTask(taskBody);
            } finally {
                // 恢复按钮状态
                transferButton.disabled = false;
                transferButton.style.background = '#007bff'
                transferButton.style.cursor = 'pointer';
                transferButton.textContent = originalText;
            }
        });
    }

    async function createTask(body, overwrite = false) {
        try {
            if (overwrite) {
                body.overwriteFolder = 1;
            }
            const transferResponse = await fetch(`${apiUrl}/api/tasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': `${apiKey}`
                },
                body: JSON.stringify(body)
            });

            const result = await transferResponse.json();
            if (result.success) {
                // 开始执行
                const ids = result.data.map(item => item.id);
                try {
                    Promise.all(ids.map(id => executeTask(id)));
                    alert('任务执行完成');
                } catch (error) {
                    alert('任务执行过程中出现错误: ' + error.message);
                }
                return true;
            } else {
                if (result.error === 'folder already exists' && !overwrite) {
                    if (confirm('该目录已经存在, 确定要覆盖吗?')) {
                        return await createTask(body, true);
                    }
                    return false;
                }
                alert('转存失败: ' + result.error);
                return false;
            }
        } catch (error) {
            alert('转存过程中出现错误: ' + error.message);
            return false;
        }
    }

    goToConfigButton.addEventListener('click', function () {
        chrome.runtime.openOptionsPage();
    });

    viewConfigLink.addEventListener('click', function (e) {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });

    
    async function executeTask(taskId) {
        try {
            await fetch(`${apiUrl}/api/tasks/${taskId}/execute`, {
                method: 'POST',
                headers: {
                    'x-api-key': `${apiKey}`
                }
            });
        } catch (error) {
            
        } 
    }
});    