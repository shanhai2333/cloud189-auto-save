// 视图切换功能
function toggleView() {
    const container = document.querySelector('.table-container').parentElement;
    container.classList.toggle('table-view');
    localStorage.setItem('tableView', container.classList.contains('table-view'));
}

// 初始化视图设置
function initViewToggle() {
    document.addEventListener('DOMContentLoaded', () => {
        const isTableView = localStorage.getItem('tableView') === 'true';
        if (isTableView) {
            document.querySelector('.table-container').parentElement.classList.add('table-view');
        }
    });
}