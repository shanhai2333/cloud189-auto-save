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

var taskList = []
// 从taskList中获取任务
function getTaskById(id) {
    return taskList.find(task => task.id == id);
}
async function fetchTasks() {
    taskList = []
    const response = await fetch(`/api/tasks`);
    const data = await response.json();
    if (data.success) {
        const tbody = document.querySelector('#taskTable tbody');
        tbody.innerHTML = '';
        data.data.forEach(task => {
            taskList.push(task)
            const progressRing = task.totalEpisodes ? createProgressRing(task.currentEpisodes || 0, task.totalEpisodes) : '';
            const taskName = task.shareFolderName?(task.resourceName + '/' + task.shareFolderName): task.resourceName || '未知'
            const cronIcon = task.enableCron ? '<span class="cron-icon" title="已开启自定义定时任务">⏰</span>' : '';
            tbody.innerHTML += `
                <tr data-status='${task.status}' data-task-id='${task.id}' data-name='${taskName}'>
                    <td>
                        <button class="btn-danger" onclick="deleteTask(${task.id})">删除</button>
                        <button class="btn-warning" onclick="executeTask(${task.id})">执行</button>
                        <button onclick="showEditTaskModal(${task.id})">修改</button>
                    </td>
                    <td data-label="资源名称">${cronIcon}<a href="${task.shareLink}" target="_blank" class='ellipsis' title="${taskName}">${taskName}</a></td>
                    <td data-label="账号">${task.account.username}</td>
                    <!--<td data-label="首次保存目录"><a href="https://cloud.189.cn/web/main/file/folder/${task.targetFolderId}" target="_blank">${task.targetFolderId}</a></td>-->
                     <td data-label="更新目录"><a href="javascript:void(0)" onclick="showFileListModal('${task.id}')" class='ellipsis'>${task.realFolderName || task.realFolderId}</a></td>
                    <td data-label="更新数/总数">${task.currentEpisodes || 0}/${task.totalEpisodes || '未知'}${progressRing}</td>
                    <td data-label="转存时间">${formatDateTime(task.lastFileUpdateTime)}</td>
                    <td data-label="备注">${task.remark?task.remark:''}</td>
                    <td data-label="状态"><span class="status-badge status-${task.status}">${formatStatus(task.status)}</span></td>
                </tr>
            `;
        });
        filterTasks()
    }
}

 // 删除任务
 async function deleteTask(id) {
    const deleteCloud = document.getElementById('deleteCloudOption').checked;
    if (!confirm(deleteCloud?'确定要删除这个任务并且从网盘中也删除吗？':'确定要删除这个任务吗？')) return;
    const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ deleteCloud })
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

// 执行所有任务
async function executeAllTask() {
    if (!confirm('确定要执行所有任务吗？')) return;
    const executeAllBtn = document.querySelector('#executeAllBtn');
    if (executeAllBtn) {
        executeAllBtn.classList.add('loading');
        executeAllBtn.disabled = true;
    }
    try {
        const response = await fetch('/api/tasks/executeAll', {
            method: 'POST'
        });
        if (response.ok) {
            alert('任务已在后台执行, 请稍后查看结果');
        } else {
            alert('任务执行失败');
        }
    } catch (error) {
        alert('任务执行失败:'+ error.message);
    } finally {
        executeAllBtn.classList.remove('loading');
        executeAllBtn.disabled = false;
    }
}

function openCreateTaskModal() {
    const lastTargetFolder = getFromCache('lastTargetFolder')
    if (lastTargetFolder) {
        const { lastTargetFolderId, lastTargetFolderName } = JSON.parse(lastTargetFolder);
        document.getElementById('targetFolderId').value = lastTargetFolderId;
        document.getElementById('targetFolder').value = lastTargetFolderName; 
    }
    document.getElementsByClassName('cronExpression-box')[0].style.display = 'none';
    document.getElementById('createTaskModal').style.display = 'block';
}

function closeCreateTaskModal() {
    document.querySelector('.share-folders-group').style.display = 'none';
    document.getElementById('shareFoldersList').innerHTML = '';;
    document.getElementById('createTaskModal').style.display = 'none';
    document.getElementById('taskForm').reset();
}

// 初始化任务表单
function initTaskForm() {
     
    // 使用防抖包装处理函数
    const debouncedHandleShare = debounce(parseShareLink, 500);
    const shareInputs = document.querySelectorAll('[data-share-input]');
    shareInputs.forEach(input => {
        input.addEventListener('blur', debouncedHandleShare);
    });

    // 修改原有的表单提交处理
    document.getElementById('taskForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        const shareLink = document.getElementById('shareLink').value;
        const totalEpisodes = document.getElementById('totalEpisodes').value;
        const targetFolderId = document.getElementById('targetFolderId').value;
        const targetFolder = document.getElementById('targetFolder').value
        const accessCode = document.getElementById('accessCode').value;
        const matchPattern = document.getElementById('matchPattern').value;
        const matchOperator = document.getElementById('matchOperator').value;
        const matchValue = document.getElementById('matchValue').value;
        const remark = document.getElementById('remark').value;
        const enableCron = document.getElementById('enableCron').checked;
        const cronExpression = document.getElementById('cronExpression').value;
        // 如果填了matchPattern那matchValue就必须填
        if (matchPattern && !matchValue) {
            alert('填了匹配模式, 那么匹配值就必须填');
            return;
        }
        if (enableCron && !cronExpression) {
            alert('开启了自定义定时任务, 那么定时表达式就必须填');
            return;
        }
        // 获取选中的分享目录
        const selectedFolders = Array.from(document.querySelectorAll('input[name="chooseShareFolder"]:checked'))
        .map(cb => cb.value);
        if (selectedFolders.length == 0) {
            alert('至少选择一个分享目录');
            return;
        }
        const body = { accountId, shareLink, totalEpisodes, targetFolderId, accessCode, matchPattern, matchOperator, matchValue, overwriteFolder: 0, remark, enableCron, cronExpression, targetFolder, selectedFolders };
        await createTask(e,body)
            
    });

    async function createTask(e, body) {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
        try {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
    
            const data = await response.json();
            if (data.success) {
                const targetFolderName = document.getElementById('targetFolder').value
                // 存储本次选择的目录
                saveToCache('lastTargetFolder', JSON.stringify({ lastTargetFolderId: body.targetFolderId, lastTargetFolderName:  targetFolderName}));
                document.getElementById('taskForm').reset();
                document.getElementById('targetFolderId').value = body.targetFolderId;
                const ids = data.data.map(item => item.id);
                await Promise.all(ids.map(id => executeTask(id, false)));
                alert('任务执行完成');
                fetchTasks();
                closeCreateTaskModal();
            } else {
                if (data.error == 'folder already exists') {
                    if (confirm('该目录已经存在, 确定要覆盖吗?')) {
                        body.overwriteFolder = 1
                        await createTask(e,body)
                    }
                    return
                }
                alert('任务创建失败: ' + data.error);
            }
        } catch (error) {
            alert('任务创建失败: ' + error.message);
        } finally {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    }
}



var chooseTask = undefined
// 文件列表弹窗
async function showFileListModal(taskId) {
    chooseTask = getTaskById(taskId);
    const accountId = chooseTask.accountId;
    const folderId = chooseTask.realFolderId;
    // 创建弹窗
    const modal = document.createElement('div');
    modal.className = 'modal files-list-modal'; 
    modal.innerHTML = `
        <div class="modal-content">
            <h3>文件列表</h3>
            <div class='modal-body'>
                <button class="batch-rename-btn" onclick="showBatchRenameOptions()">批量重命名</button>
                <div class='form-body'>
                <table>
                    <thead>
                        <tr>
                            <th><input type="checkbox" id="selectAll" onclick="toggleSelectAll()"></th>
                            <th>文件名</th>
                            <th>大小</th>
                            <th>修改时间</th>
                        </tr>
                    </thead>
                    <tbody id="fileListBody"></tbody>
                </table>
                </div>
            </div>
            <div class="form-actions">
                <button onclick="closeFileListModal()">关闭</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    // 获取文件列表
    try {
        const response = await fetch(`/api/folder/files?accountId=${accountId}&folderId=${folderId}`);
        const data = await response.json();
        if (data.success) {
            const tbody = document.getElementById('fileListBody');
            data.data.forEach(file => {
                tbody.innerHTML += `
                    <tr>
                        <td><input type="checkbox" class="file-checkbox" data-filename="${file.name}" data-id="${file.id}"></td>
                        <td>${file.name}</td>
                        <td>${formatFileSize(file.size)}</td>
                        <td>${file.createDate}</td>
                    </tr>
                `;
            });
        }
    } catch (error) {
        alert('获取文件列表失败：' + error.message);
    }
}
// 显示批量重命名选项
function showBatchRenameOptions() {
    const sourceRegex = escapeHtmlAttr(chooseTask.sourceRegex)?? ''
    const targetRegex = escapeHtmlAttr(chooseTask.targetRegex)?? ''
    const selectedFiles = Array.from(document.querySelectorAll('.file-checkbox:checked')).map(cb => cb.dataset.filename);
    if (selectedFiles.length === 0) {
        alert('请选择要重命名的文件');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal rename-options-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>批量重命名</h3>
            <div class="form-body">
                <div class="rename-type-selector">
                    <label class="radio-label">
                        <input type="radio" name="renameType" value="regex" checked>
                        正则表达式重命名
                    </label>
                    <label class="radio-label">
                        <input type="radio" name="renameType" value="sequential">
                        顺序重命名
                    </label>
                </div>
                <div id="renameDescription" class="rename-description">
                    正则表达式文件重命名。在第一行输入源文件名正则表达式，并在第二行输入新文件名正则表达式。<span class="help-icon" data-tooltip="常用正则表达式示例">?</span>
                </div>
                <div id="regexInputs" class="rename-inputs">
                    <div class="form-group">
                        <input type="text" id="sourceRegex" class="form-input" placeholder="源文件名正则表达式" value="${sourceRegex}">
                    </div>
                    <div class="form-group">
                        <input type="text" id="targetRegex" class="form-input" placeholder="新文件名正则表达式" value="${targetRegex}">
                    </div>
                </div>
                <div id="sequentialInputs" class="rename-inputs" style="display: none;">
                    <div class="form-group">
                        <input type="text" id="newNameFormat" class="form-input" placeholder="新文件名格式">
                    </div>
                    <div class="form-group">
                        <input type="number" id="startNumber" class="form-input" value="" min="1" placeholder="起始序号">
                    </div>
                </div>
            </div>
            <div class="form-actions">
                <button class="saveAndAutoUpdate btn-warning" onclick="previewRename(true)">确定并自动更新</button>
                <button class="btn-default" onclick="closeRenameOptionsModal()">取消</button>
                <button class="btn-primary" onclick="previewRename(false)">确定</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';

    // 添加单选框切换事件
    const radioButtons = modal.querySelectorAll('input[name="renameType"]');
    const description = modal.querySelector('#renameDescription');
    const regexInputs = modal.querySelector('#regexInputs');
    const sequentialInputs = modal.querySelector('#sequentialInputs')
    
    radioButtons.forEach(radio => {
        radio.addEventListener('change', (e) => {
            modal.querySelector('.saveAndAutoUpdate').style.display = 'none';
            if (e.target.value === 'regex') {
                description.textContent = '正则表达式文件重命名。 在第一行输入源文件名正则表达式，并在第二行输入新文件名正则表达式。如果新旧名称相同, 则跳过该文件。';
                regexInputs.style.display = 'block';
                sequentialInputs.style.display = 'none';
                modal.querySelector('.saveAndAutoUpdate').style.display = 'inline-block';
            } else {
                description.textContent = '新文件名将有一个数值起始值附加到它， 并且它将通过向起始值添加 1 来按顺序显示。 在第一行输入新的文件名，并在第二行输入起始值。';
                regexInputs.style.display = 'none';
                sequentialInputs.style.display = 'block';
            }
        });
    });
}

// 预览重命名
async function previewRename(autoUpdate = false) {
    const selectedFiles = Array.from(document.querySelectorAll('.file-checkbox:checked')).map(cb => cb.dataset.filename);
    const renameType = document.querySelector('input[name="renameType"]:checked').value;
    let newNames = [];

    if (renameType === 'regex') {
        const sourceRegex = escapeRegExp(document.getElementById('sourceRegex').value);
        const targetRegex = escapeRegExp(document.getElementById('targetRegex').value);
        newNames = selectedFiles
            .map(filename => {
                const checkbox = document.querySelector(`.file-checkbox[data-filename="${filename}"]`);
                try {
                    const destFileName = filename.replace(new RegExp(sourceRegex), targetRegex);
                    // 如果文件名没有变化，说明没有匹配成功
                    return destFileName !== filename ? {
                        fileId: checkbox.dataset.id,
                        oldName: filename,
                        destFileName
                    } : null;
                } catch (e) {
                    return null;
                }
            })
            .filter(Boolean);
    } else {
        const nameFormat = document.getElementById('newNameFormat').value;
        const startNum = parseInt(document.getElementById('startNumber').value);
        const padLength = document.getElementById('startNumber').value.length;
        
        newNames = selectedFiles.map((filename, index) => {
            const checkbox = document.querySelector(`.file-checkbox[data-filename="${filename}"]`);
            const ext = filename.split('.').pop();
            const num = (startNum + index).toString().padStart(padLength, '0');
            return {
                fileId: checkbox.dataset.id,
                oldName: filename,
                destFileName: `${nameFormat}${num}.${ext}`
            };
        });
        autoUpdate = false
    }
    showRenamePreview(newNames, autoUpdate);
}

function showRenamePreview(newNames, autoUpdate) {
    const modal = document.createElement('div');
    modal.className = 'modal preview-rename-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>重命名预览</h3>
            <div class="form-body">
                <table>
                    <thead>
                        <tr>
                            <th tyle="width: 400px;">原文件名</th>
                            <th tyle="width: 400px;">新文件名</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${newNames.map(file => `
                            <tr data-file-id="${file.fileId}">
                                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.oldName}</td>
                                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.destFileName}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="form-actions">
                <button onclick="submitRename(${autoUpdate})">确定</button>
                <button onclick="backToRenameOptions()">返回</button>
                <button onclick="closeRenamePreviewModal()">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function backToRenameOptions() {
    closeRenamePreviewModal();
}

async function submitRename(autoUpdate) {
    const files = Array.from(document.querySelectorAll('.preview-rename-modal tr[data-file-id]')).map(row => ({
        fileId: row.dataset.fileId,
        destFileName: row.querySelector('td:last-child').textContent
    }));
    if (files.length == 0) {
        alert('没有需要重命名的文件');
        return
    }
    if (autoUpdate) {
        if (!confirm('当前选择的是自动更新, 请确认正则表达式是否正确, 否则后续的文件可能无法正确重命名')){
            return;
        }
    }
    const accountId = chooseTask.accountId;
    const taskId = chooseTask.id;
    const sourceRegex = autoUpdate ? escapeRegExp(document.getElementById('sourceRegex').value): null;
    const targetRegex = autoUpdate ? escapeRegExp(document.getElementById('targetRegex').value): null;
    try {
        const response = await fetch('/api/files/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, accountId, files, sourceRegex, targetRegex })
        });
        const data = await response.json();
        if (data.success) {
            if (data.data && data.data.length > 0) {
                alert('部分文件重命名失败:'+ data.data.join(', '));
            }else{
                alert('重命名成功');
            }
            closeRenamePreviewModal();
            closeRenameOptionsModal();
            closeFileListModal()
            chooseTask.sourceRegex = sourceRegex;
            chooseTask.targetRegex = targetRegex;
            // 刷新文件列表
            showFileListModal(taskId);
            fetchTasks()
        } else {
            alert('重命名失败: ' + data.error);
        }
    } catch (error) {
        alert('重命名失败: ' + error.message);
    }
}
// 辅助函数
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.file-checkbox');
    const selectAll = document.getElementById('selectAll');
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
}

// 修改关闭弹窗函数
function closeFileListModal() {
    const modal = document.querySelector('.files-list-modal');
    modal?.remove();
}

function closeRenameOptionsModal() {
    const modal = document.querySelector('.rename-options-modal');
    modal?.remove();
}

function closeRenameModal() {
    const modal = document.querySelector('.regex-rename-modal, .sequential-rename-modal');
    modal?.remove();
}

function closeRenamePreviewModal() {
    const modal = document.querySelector('.preview-rename-modal');
    modal?.remove();
}

// 处理反斜杠
function escapeRegExp(regexStr) {
    // 不再处理
    return regexStr;
}

// 转义HTML属性中的特殊字符
function escapeHtmlAttr(str) {
    // 不再处理
    return str;
}

// 初始化表单展开/隐藏功能
function initFormToggle() {
    const toggleBtn = document.getElementById('toggleFormBtn');
    const taskForm = document.getElementById('taskForm');
    const toggleText = toggleBtn.querySelector('.toggle-text');
    const toggleIcon = toggleBtn.querySelector('.toggle-icon');

    toggleBtn.addEventListener('click', () => {
        const isHidden = taskForm.style.display === 'none';
        taskForm.style.display = isHidden ? 'block' : 'none';
        toggleText.textContent = isHidden ? '隐藏' : '展开';
        toggleIcon.textContent = isHidden ? '▲' : '▼';
    });
}


function filterTasks() {
    const taskFilter = document.getElementById('taskFilter');
    const taskSearch = document.getElementById('taskSearch');
    const status = taskFilter.value;
    const searchText = taskSearch.value.toLowerCase();
    const tasks = document.querySelectorAll('#taskTable tbody tr');
    
    tasks.forEach(task => {
        const taskStatus = task.getAttribute('data-status');
        const taskName = task.getAttribute('data-name').toLowerCase();
        const statusMatch = status === 'all' || status === taskStatus;
        const searchMatch = !searchText || taskName.includes(searchText);
        task.style.display = statusMatch && searchMatch ? '' : 'none';
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const dropdownToggle = document.querySelector('.dropdown-toggle');
    const dropdownGroup = document.querySelector('.dropdown-button-group');

    dropdownToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        dropdownGroup.classList.toggle('active');
    });

    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', function(e) {
        if (!dropdownGroup.contains(e.target)) {
            dropdownGroup.classList.remove('active');
        }
    });

    const debouncedFilterTasks = debounce(filterTasks, 300);
    // 任务筛选功能
    const taskFilter = document.getElementById('taskFilter');
    const taskSearch = document.getElementById('taskSearch');
    taskFilter.addEventListener('change', function() {
        debouncedFilterTasks();
    });

    taskSearch.addEventListener('input', function() {
        debouncedFilterTasks();
    });
    // 批量选择功能
    const taskTable = document.getElementById('taskTable');
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    
    taskTable.addEventListener('click', function(e) {
        const row = e.target.closest('tr');
        if (!row) return;
        
        row.classList.toggle('selected');
        if (batchDeleteBtn) {
            const selectedTasks = document.querySelectorAll('#taskTable tbody tr.selected');
            batchDeleteBtn.style.display = selectedTasks.length > 0 ? '' : 'none';
        }
    });
});



// 批量删除功能
async function deleteSelectedTasks() {
    const selectedTasks = document.querySelectorAll('#taskTable tbody tr.selected');
    const taskIds = Array.from(selectedTasks).map(row => row.getAttribute('data-task-id'));
    if (taskIds.length === 0) {
        alert('请选择要删除的任务');
        return;
    }
    const deleteCloud = document.getElementById('deleteCloudOption').checked;
    if (!confirm(deleteCloud?'确定要删除选中任务并且从网盘中也删除吗？':'确定要删除选中的任务吗？')) return;
    
    try {
        const response = await fetch('/api/tasks/batch', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskIds, deleteCloud })
        });

        const data = await response.json();
        if (data.success) {
            alert('批量删除成功');
            fetchTasks();
        } else {
            alert('批量删除失败: ' + data.error);
        }
    } catch (error) {
        alert('操作失败: ' + error.message);
    }
}
// 添加时间格式化函数
function formatDateTime(dateStr) {
    if (!dateStr) return '未更新';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const statusOptions = {
    pending: '等待中',
    processing: '追剧中',
    completed: '已完结',
    failed: '失败'
}
// 格式化状态
function formatStatus(status) {
    return statusOptions[status] || status;
}

// 监听enableCron的变化
document.getElementById('enableCron').addEventListener('change', function() {
    // 如果为选中 则显示cron表达式输入框
    const cronInput = document.getElementsByClassName('cronExpression-box')[0];
    cronInput.style.display = this.checked? 'block' : 'none';
});

// 生成STRM
async function generateStrm() {
    const selectedTasks = document.querySelectorAll('#taskTable tbody tr.selected');
    const taskIds = Array.from(selectedTasks).map(row => row.getAttribute('data-task-id'));
    if (taskIds.length === 0) {
        alert('请选择要生成STRM的任务');
        return;
    }
    let overwrite = false;
    if (confirm('是否覆盖已存在的STRM文件')){
        overwrite = true;
    }
    try {
        const response = await fetch('/api/tasks/strm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskIds, overwrite })
        });
        const data = await response.json();
        if (data.success) {
            alert('任务后台执行中, 请稍后查看结果');
        } else {
            alert('生成STRM失败: ' + data.error);
        }
    } catch (error) {
        alert('操作失败: ' + error.message);
    }
}

// 解析分享链接获取分享目录组合
async function parseShareLink() {
    const shareParseError = document.getElementById('shareParseError');
    shareParseError.textContent = ''; // 清除之前的错误信息
    let shareLink = document.getElementById('shareLink')?.value?.trim();
    let accessCode = document.getElementById('accessCode')?.value?.trim();
    const accountId = document.getElementById('accountId')?.value;
    if (!shareLink || !accountId) {
        return;
    }
    // 如果shareLink是https://cloud.189.cn/t/xxxx（访问码：xxx） 需要匹配出url和访问码
    const regex = /^(https:\/\/cloud\.189\.cn\/t\/[a-zA-Z0-9]+)(?:\s*（访问码：([a-zA-Z0-9]+)）)?$/;
    const match = regex.exec(shareLink);
    if (match && match.length >= 2 && match[2]) {
        shareLink = match[1];
        accessCode = match[2];
        document.getElementById('accessCode').value = accessCode;
    }
    const shareFoldersGroup = document.querySelector('.share-folders-group');
    const shareFoldersList = document.getElementById('shareFoldersList');
    try {
        const response = await fetch('/api/share/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shareLink, accessCode, accountId })
        });
        const data = await response.json();
        if (data.success) {
            shareFoldersGroup.style.display = 'block';
            shareFoldersList.innerHTML = data.data.map(folder => `
                <div class="folder-item">
                    <label>
                        <input type="checkbox" name="chooseShareFolder" value="${folder}" checked>
                        ${folder}
                    </label>
                </div>
            `).join('');
        } else {
            shareFoldersGroup.style.display = 'none';
            shareFoldersList.innerHTML = '';
            if (data.error) {
                shareParseError.textContent = `解析失败: ${data.error}`;
            }
        }
    } catch (error) {
        shareFoldersGroup.style.display = 'none';
        shareFoldersList.innerHTML = '';
        shareParseError.textContent = `操作失败: ${error.message}`;
    }
}

// 全选/取消全选处理
document.getElementById('selectAllFolders').addEventListener('change', function(e) {
    const checkboxes = document.querySelectorAll('input[name="chooseShareFolder"]');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
});