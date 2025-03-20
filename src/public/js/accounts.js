// 账号相关功能
async function fetchAccounts() {
    const response = await fetch('/api/accounts');
    const data = await response.json();
    if (data.success) {
        const tbody = document.querySelector('#accountTable tbody');
        const select = document.querySelector('#accountId');
        tbody.innerHTML = '';
        select.innerHTML = '';
        
        data.data.forEach(account => {
            tbody.innerHTML += `
                <tr>
                    <td><button class="btn-warning" onclick="deleteAccount(${account.id})">删除</button></td>
                    <td data-label='账号ID'>${account.id}</td>
                    <td data-label='账户名'>${account.username}</td>
                    <td data-label='个人容量'>${formatBytes(account.capacity.cloudCapacityInfo.usedSize) + '/' + formatBytes(account.capacity.cloudCapacityInfo.totalSize)}</td>
                    <td data-label='家庭容量'>${formatBytes(account.capacity.familyCapacityInfo.usedSize) + '/' + formatBytes(account.capacity.familyCapacityInfo.totalSize)}</td>
                </tr>
            `;
            select.innerHTML += `
                <option value="${account.id}">${account.username}</option>
            `;
        });
    }
}

async function deleteAccount(id) {
    if (!confirm('确定要删除这个账号吗？')) return;

    const response = await fetch(`/api/accounts/${id}`, {
        method: 'DELETE'
    });

    const data = await response.json();
    if (data.success) {
        alert('账号删除成功');
        fetchAccounts();
    } else {
        alert('账号删除失败: ' + data.error);
    }
}

// 添加账号表单处理
function initAccountForm() {
    document.getElementById('accountForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        const response = await fetch('/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (data.success) {
            alert('账号添加成功');
            document.getElementById('accountForm').reset();
            fetchAccounts();
        } else {
            alert('账号添加失败: ' + data.error);
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