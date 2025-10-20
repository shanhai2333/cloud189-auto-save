// 选项卡切换
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
            // 保存当前选项卡
            localStorage.setItem('activeTab', tab.dataset.tab);
        });
    });

    // 页面加载时恢复上次的选项卡
    const lastTab = localStorage.getItem('activeTab');
    let restored = false;
    if (lastTab) {
        const tabToActivate = document.querySelector(`[data-tab="${lastTab}"]`);
        if (tabToActivate) {
            tabToActivate.click();
            restored = true;
        }
    }

    // 如果没有恢复, 则默认点击'task'
    if (!restored) {
        const defaultTab = document.querySelector('[data-tab="task"]');
        if (defaultTab) {
            defaultTab.click();
        }
    }
}