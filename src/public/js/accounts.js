let accountsList = []
// 账号相关功能
async function fetchAccounts(updateSelect = false) {
    const response = await fetch('/api/accounts');
    const data = await response.json();
    // 如果http状态码为401, 则跳转到登录页面
    if (response.status === 401) {
        window.location.href = '/login';
        return;
    }
    
    if (data.success) {
        const tbody = document.querySelector('#accountTable tbody');
        const select = document.querySelector('#accountId');
        tbody.innerHTML = '';
        if (updateSelect) {
            select.innerHTML = '' 
        }
        accountsList = data.data
        data.data.forEach(account => {
            tbody.innerHTML += `
                <tr>
                    <td>${account.cookies && !account.password ? 
                        `<button class="btn-warning" onclick="updateCookie(${account.id})">修改Cookie</button>` 
                        : ''}  <span class="default-star" onclick="setDefaultAccount(${account.id})" title="设为默认账号">
                            ${account.isDefault ? '★' : '☆'}
                        </span>
                        <button class="btn-danger" onclick="deleteAccount(${account.id})">删除</button>
                        </td>
                    <td data-label='账户名'>${account.username}</td>
                    <td data-label='别名' onclick="updateAlias(${account.id}, '${account.alias || ''}')">${account.alias}</td>
                    <td data-label='个人容量'>${formatBytes(account.capacity.cloudCapacityInfo.usedSize) + '/' + formatBytes(account.capacity.cloudCapacityInfo.totalSize)}</td>
                    <td data-label='家庭容量'>${formatBytes(account.capacity.familyCapacityInfo.usedSize) + '/' + formatBytes(account.capacity.familyCapacityInfo.totalSize)}</td>
                    <td class='strm-prefix' data-label='媒体目录' style="cursor: pointer;" onclick="updateCloudStrmPrefix(${account.id}, '${account.cloudStrmPrefix || ''}')">${account.cloudStrmPrefix || ''}</td>
                    <td class='strm-prefix' data-label='本地目录' style="cursor: pointer;" onclick="updateLocalStrmPrefix(${account.id}, '${account.localStrmPrefix || ''}')">${account.localStrmPrefix || ''}</td>
                    <td class='emby-path-replace' data-label='Emby路径替换' style="cursor: pointer;" onclick="updateEmbyPathReplace(${account.id}, '${account.embyPathReplace || ''}')">${account.embyPathReplace || ''}</td>
                </tr>
            `;
            if (updateSelect) {
                // n_打头的账号不显示在下拉列表中
                if (!account.username.startsWith('n_')) {
                    select.innerHTML += `
                    <option value="${account.id}" ${account.isDefault?"selected":''}>${account.username}</option>
                `;
                }
            }
        });
    }
}

async function deleteAccount(id) {
    if (!confirm('确定要删除这个账号吗？')) return;
    loading.show()
    const response = await fetch(`/api/accounts/${id}`, {
        method: 'DELETE'
    });
    loading.hide()
    const data = await response.json();
    if (data.success) {
        message.success('账号删除成功');
        fetchAccounts();
    } else {
        message.warning('账号删除失败: ' + data.error);
    }
}

// 更新 cookie
async function updateCookie(id) {
    const newCookie = prompt('请输入新的Cookie');
    if (!newCookie) return;
    loading.show()
    const response = await fetch(`/api/accounts/${id}/cookie`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie: newCookie })
    });
    loading.hide()
    const data = await response.json();
    if (data.success) {
        message.success('Cookie更新成功');
        fetchAccounts();
    } else {
        message.warning('Cookie更新失败: ' + data.error);
    }
}
// 添加账号表单处理
function initAccountForm() {
    document.getElementById('accountForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const cookies  = document.getElementById('cookie').value;
        const alias = document.getElementById('alias').value;
        if (!username ) {
            message.warning('用户名不能为空');
            return;
        }
        if (!password && !cookies) {
            message.warning('密码和Cookie不能同时为空');
            return;
        }
        const response = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, cookies, alias })
        });
        const data = await response.json();
        if (data.success) {
            message.success('账号添加成功');
            document.getElementById('accountForm').reset();
            fetchAccounts();
        } else {
            message.warning('账号添加失败: ' + data.error);
        }
    });
}
function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '0B';
    if (bytes < 0) return '-' + formatBytes(-bytes);
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const base = 1024;
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1);
    const value = bytes / Math.pow(base, exponent);
    
    return value.toFixed(exponent > 0 ? 2 : 0) + units[exponent];
}
async function clearRecycleBin() {
    if (!confirm('确定要清空所有账号的回收站吗？')) {
        return;
    }
    try {
        const response = await fetch('/api/accounts/recycle', {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            message.success('后台任务执行中, 请稍后查看结果');
        } else {
            message.warning('清空回收站失败: ' + data.error);
        }
    } catch (error) {
        message.warning('操作失败: ' + error.message);
    }
}

// 添加更新 STRM 前缀的函数
async function updateCloudStrmPrefix(id, currentPrefix) {
    const newPrefix = prompt('请输入新的媒体目录前缀', currentPrefix);
    if (newPrefix === null) return; // 用户点击取消
    try {
        const response = await fetch(`/api/accounts/${id}/strm-prefix`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ strmPrefix: newPrefix, type: 'cloud'  })
        });

        const data = await response.json();
        if (data.success) {
            message.success('更新成功');
            fetchAccounts(true);
        } else {
            message.warning('更新失败: ' + data.error);
        }
    } catch (error) {
        message.warning('操作失败: ' + error.message);
    }
}
async function updateLocalStrmPrefix(id, currentPrefix) {
    const newPrefix = prompt('请输入新的本地目录前缀', currentPrefix);
    if (newPrefix === null) return; // 用户点击取消

    try {
        const response = await fetch(`/api/accounts/${id}/strm-prefix`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ strmPrefix: newPrefix, type: 'local' })
        });

        const data = await response.json();
        if (data.success) {
            message.success('更新成功');
            fetchAccounts(true);
        } else {
            message.warning('更新失败: ' + data.error);
        }
    } catch (error) {
        message.warning('操作失败: ' + error.message);
    }
}

async function updateEmbyPathReplace(id, embyPathReplace) {
    const newEmbyPathReplace = prompt('请输入新的Emby替换路径', embyPathReplace);
    if (newEmbyPathReplace === null) return; // 用户点击取消

    try {
        const response = await fetch(`/api/accounts/${id}/strm-prefix`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ strmPrefix: newEmbyPathReplace, type: 'emby' })
        });

        const data = await response.json();
        if (data.success) {
            message.success('更新成功');
            fetchAccounts(true);
        } else {
            message.warning('更新失败: ' + data.error);
        }
    } catch (error) {
        message.warning('操作失败: ' + error.message);
    }
}

async function updateAlias(id, currentAlias) {
    const newAlias = prompt('请输入新的别名', currentAlias);
    if (newAlias === null) return; 
    try {
        const response = await fetch(`/api/accounts/${id}/alias`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alias: newAlias })
        })
        const data = await response.json();
        if (data.success) {
            message.success('更新成功');
            fetchAccounts(true);
        } else {
            message.warning('更新失败:'+ data.error);
        }
    } catch (error) {
        message.warning('操作失败:'+ error.message);
    }
}

async function setDefaultAccount(id) {
    try {
        const response = await fetch(`/api/accounts/${id}/default`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.success) {
            message.success('设置默认账号成功');
            fetchAccounts(true);  // 更新账号列表和下拉框
        } else {
            message.warning('设置默认账号失败: ' + data.error);
        }
    } catch (error) {
        message.warning('操作失败: ' + error.message);
    }
}