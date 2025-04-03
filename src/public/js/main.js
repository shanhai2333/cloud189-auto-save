async function loadVersion() {
    try {
        const response = await fetch('/api/version');
        const data = await response.json();
        document.getElementById('version').innerText = `v${data.version}`;
    } catch (error) {
        console.error('Failed to load version:', error);
    }
}

// 主入口文件
document.addEventListener('DOMContentLoaded', () => {
    // 加载版本号
    loadVersion();
    // 初始化所有功能
    initTabs();
    initAccountForm();
    initTaskForm();
    initEditTaskForm();
    // 初始化主题
    initTheme();

    // 初始化目录选择器
    const folderSelector = new FolderSelector({
        enableFavorites: true,
        favoritesKey: 'createTaskFavorites',
        onSelect: ({ id, name }) => {
            document.getElementById('targetFolder').value = name;
            document.getElementById('targetFolderId').value = id;
        }
    });

    // 修改目录选择触发方式
    document.getElementById('targetFolder').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            alert('请先选择账号');
            return;
        }
        folderSelector.show(accountId);
    });

    // 添加常用目录按钮点击事件
    document.getElementById('favoriteFolderBtn').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            alert('请先选择账号');
            return;
        }
        folderSelector.showFavorites(accountId);
    });

    // 初始化数据
    fetchAccounts(true);
    fetchTasks();

    // 定时刷新数据
    setInterval(() => {
        fetchAccounts();
        fetchTasks();
    }, 30000);
});


// 从缓存获取数据
function getFromCache(key) {
    return localStorage.getItem(key);
}
// 保存数据到缓存
function saveToCache(key, value) {
    localStorage.setItem(key, value);
}