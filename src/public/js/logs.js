function initLogs() {
    const logsContainer = document.getElementById('logsContainer');
    const showLogsBtn = document.getElementById('showLogsBtn');
    const logsModal = document.getElementById('logsModal');
    const closeBtn = logsModal.querySelector('.close-btn');
    
    let eventSource = null;

    function connectSSE() {
        eventSource = new EventSource('/api/logs/events');

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'history') {
                logsContainer.innerHTML = data.logs.join('<br>');
                logsContainer.scrollTop = logsContainer.scrollHeight;
            } else if (data.type === 'log') {
                const div = document.createElement('div');
                div.textContent = data.message;
                logsContainer.appendChild(div);
                logsContainer.scrollTop = logsContainer.scrollHeight;
            }
        };

        eventSource.onerror = () => {
            eventSource.close();
            setTimeout(connectSSE, 1000);
        };
    }

    showLogsBtn.onclick = () => {
        logsModal.style.display = 'block';
        console.log(eventSource)
        if (!eventSource) {
            connectSSE();
        }
        // 显示弹窗时滚动到最新消息
        logsContainer.scrollTop = logsContainer.scrollHeight;
    };

    closeBtn.onclick = () => {
        logsModal.style.display = 'none';
    };

    // 页面关闭时才断开连接
    window.addEventListener('beforeunload', () => {
        eventSource.close();
    });
}
