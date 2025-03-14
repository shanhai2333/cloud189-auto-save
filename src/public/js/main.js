// 主入口文件
document.addEventListener('DOMContentLoaded', () => {
    // 初始化所有功能
    initTabs();
    initAccountForm();
    initTaskForm();
    initEditTaskForm();
    initViewToggle();

    // 初始化目录选择器
    const folderSelector = new FolderSelector({
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

    // 初始化数据
    fetchAccounts();
    fetchTasks();

    // 定时刷新数据
    setInterval(() => {
        fetchAccounts();
        fetchTasks();
    }, 30000);
});