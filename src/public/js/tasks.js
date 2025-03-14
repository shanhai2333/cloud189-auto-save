// 任务相关功能
function createProgressRing(current, total) {
    if (!total) return '';
    
    const radius = 12;
    const circumference = 2 * Math.PI * radius;
    const progress = (current / total) * 100;
    const offset = circumference - (progress / 100) * circumference;
    const percentage = Math.round((current / total) * 100);
    
    return `
        <div class="progress-ring">
            <svg width="30" height="30">
                <circle
                    stroke="#e8f5e9"
                    stroke-width="3"
                    fill="transparent"
                    r="${radius}"
                    cx="15"
                    cy="15"
                />
                <circle
                    stroke="#52c41a"
                    stroke-width="3"
                    fill="transparent"
                    r="${radius}"
                    cx="15"
                    cy="15"
                    style="stroke-dasharray: ${circumference} ${circumference}; stroke-dashoffset: ${offset}"
                />
            </svg>
            <span class="progress-ring__text">${percentage}%</span>
        </div>
    `;
}

async function fetchTasks() {
    const response = await fetch('/api/tasks');
    const data = await response.json();
    if (data.success) {
        const tbody = document.querySelector('#taskTable tbody');
        tbody.innerHTML = '';
        
        data.data.forEach(task => {
            const progressRing = task.totalEpisodes ? createProgressRing(task.currentEpisodes || 0, task.totalEpisodes) : '';
            tbody.innerHTML += `
                <tr>
                    <td data-label="操作">
                        <button class="delete-btn" onclick="deleteTask(${task.id})">删除</button>
                        <button onclick="executeTask(${task.id})">执行</button>
                        <button onclick="showEditTaskModal(${task.id}, '${task.videoType}', '${task.realFolderId || ''}', ${task.currentEpisodes || 0}, ${task.totalEpisodes || 0}, '${task.status}','${task.shareLink}','${task.shareFolderId}','${task.shareFolderName}', '${task.resourceName}', '${task.realFolderName}')">修改</button>
                    </td>
                    <td data-label="资源名称"><a href="${task.shareLink}" target="_blank" class='ellipsis' title="${task.shareFolderName ? (task.resourceName + '/' + task.shareFolderName) : task.resourceName || '未知'}">${task.shareFolderName?(task.resourceName + '/' + task.shareFolderName): task.resourceName || '未知'}</a></td>
                    <td data-label="账号ID">${task.accountId}</td>
                    <td data-label="视频类型">${task.videoType}</td>
                    <td data-label="首次保存目录"><a href="https://cloud.189.cn/web/main/file/folder/${task.targetFolderId}" target="_blank">${task.targetFolderId}</a></td>
                    <td data-label="更新目录"><a href="https://cloud.189.cn/web/main/file/folder/${task.realFolderId}" target="_blank">${task.shareFolderName || task.targetFolderId}</a></td>
                    <td data-label="更新数/总数">${task.currentEpisodes || 0}/${task.totalEpisodes || '未知'}${progressRing}</td>
                    <td data-label="状态"><span class="status-badge status-${task.status}">${task.status}</span></td>
                </tr>
            `;
        });
    }
}

 // 删除任务
 async function deleteTask(id) {
    if (!confirm('确定要删除这个任务吗？')) return;

    const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE'
    });

    const data = await response.json();
    if (data.success) {
        alert('任务删除成功');
        fetchTasks();
    } else {
        alert('任务删除失败: ' + data.error);
    }
}


async function executeTask(id, refresh = true) {
    const executeBtn = document.querySelector(`button[onclick="executeTask(${id})"]`);
    if (executeBtn) {
        executeBtn.classList.add('loading');
        executeBtn.disabled = true;
    }
    try {
        const response = await fetch(`/api/tasks/${id}/execute`, {
            method: 'POST'
        });
        if (response.ok) {
            refresh && alert('任务执行完成');
            refresh && fetchTasks();
        } else {
            alert('任务执行失败');
        }
    } catch (error) {
        alert('任务执行失败: ' + error.message);
    } finally {
        if (executeBtn) {
            executeBtn.classList.remove('loading');
            executeBtn.disabled = false;
        }
    }
}

// 初始化任务表单
function initTaskForm() {
    document.getElementById('taskForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
    
        try {
            const accountId = document.getElementById('accountId').value;
            const shareLink = document.getElementById('shareLink').value;
            const videoType = document.getElementById('videoType').value;
            const totalEpisodes = document.getElementById('totalEpisodes').value;
            const targetFolderId = document.getElementById('targetFolderId').value;
    
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId, shareLink, videoType, totalEpisodes, targetFolderId })
            });
    
            const data = await response.json();
            if (data.success) {
                document.getElementById('taskForm').reset();
                const ids = data.data.map(item => item.id);
                await Promise.all(ids.map(id => executeTask(id, false)));
                alert('任务执行完成');
                fetchTasks();
            } else {
                alert('任务创建失败: ' + data.error);
            }
        } catch (error) {
            alert('任务创建失败: ' + error.message);
        } finally {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    });
}