// 修改任务相关功能
let shareFolderSelector = new FolderSelector({
    apiUrl: "/api/share/folders",
    onSelect: ({ id, name }) => {
        document.getElementById('shareFolder').value = name;
        document.getElementById('shareFolderId').value = id;
    },
    buildParams: (accountId, folderId) => {
        const taskId = document.getElementById('editTaskId').value;
        return `${accountId}?folderId=${folderId}&taskId=${taskId}`;
    }
});

let editFolderSelector = new FolderSelector({
    onSelect: ({ id, name }) => {
        document.getElementById('editRealFolder').value = name;
        document.getElementById('editRealFolderId').value = id;
    }
});

function showEditTaskModal(id, realFolderId, currentEpisodes, totalEpisodes, status, shareLink, shareFolderId, shareFolderName, resourceName, realFolderName) {
    document.getElementById('editTaskId').value = id;
    document.getElementById('editResourceName').value = resourceName;
    document.getElementById('editRealFolder').value = realFolderName?realFolderName:realFolderId;
    document.getElementById('editRealFolderId').value = realFolderId;
    document.getElementById('editCurrentEpisodes').value = currentEpisodes;
    document.getElementById('editTotalEpisodes').value = totalEpisodes;
    document.getElementById('editStatus').value = status;
    document.getElementById('shareLink').value = shareLink;
    document.getElementById('shareFolder').value = shareFolderName;
    document.getElementById('shareFolderId').value = shareFolderId;
    document.getElementById('editTaskModal').style.display = 'block';
}

function closeEditTaskModal() {
    document.getElementById('editTaskModal').style.display = 'none';
}

function initEditTaskForm() {
    document.getElementById('shareFolder').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            alert('请先选择账号');
            return;
        }
        shareFolderSelector.show(accountId);
    });

    // 更新目录也改为点击触发
    document.getElementById('editRealFolder').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            alert('请先选择账号');
            return;
        }
        editFolderSelector.show(accountId);
    });

    document.getElementById('editTaskForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editTaskId').value;
        const resourceName = document.getElementById('editResourceName').value;
        const realFolderId = document.getElementById('editRealFolderId').value;
        const realFolderName = document.getElementById('editRealFolder').value;
        const currentEpisodes = document.getElementById('editCurrentEpisodes').value;
        const totalEpisodes = document.getElementById('editTotalEpisodes').value;
        const shareFolderName = document.getElementById('shareFolder').value;
        const shareFolderId = document.getElementById('shareFolderId').value;
        const status = document.getElementById('editStatus').value;

        try {
            const response = await fetch(`/api/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    resourceName,
                    realFolderId,
                    currentEpisodes: parseInt(currentEpisodes),
                    totalEpisodes: parseInt(totalEpisodes),
                    status,
                    shareFolderName,
                    shareFolderId,
                    realFolderName
                })
            });

            if (response.ok) {
                closeEditTaskModal();
                await fetchTasks();
            } else {
                const error = await response.json();
                alert(error.message || '修改任务失败');
            }
        } catch (error) {
            alert('修改任务失败：' + error.message);
        }
    });
}