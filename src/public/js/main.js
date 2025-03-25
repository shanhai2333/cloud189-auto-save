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
    initFormToggle();
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

// 主题切换相关功能
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const themeDropdown = document.getElementById('themeDropdown');
    const savedTheme = localStorage.getItem('theme') || 'auto';
    
    // 设置初始主题
    setTheme(savedTheme);
    
    // 切换下拉菜单显示
    themeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        themeDropdown.classList.toggle('show');
    });
    
    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', () => {
        themeDropdown.classList.remove('show');
    });
    
    // 主题选项点击事件
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', (e) => {
            const theme = e.target.dataset.theme;
            setTheme(theme);
            localStorage.setItem('theme', theme);
            themeDropdown.classList.remove('show');
        });
    });
}

function setTheme(theme) {
    if (theme === 'auto') {
        // 检查系统主题
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
        // 监听系统主题变化
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        });
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}

// 从缓存获取数据
function getFromCache(key) {
    return localStorage.getItem(key);
}
// 保存数据到缓存
function saveToCache(key, value) {
    localStorage.setItem(key, value);
}