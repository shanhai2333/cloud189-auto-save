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
                    <td>${account.id}</td>
                    <td>${account.username}</td>
                    <td><button class="delete-btn" onclick="deleteAccount(${account.id})">删除</button></td>
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