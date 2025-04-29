// STRM功能相关的JavaScript代码
let currentPath = '';


let strmFolderSelector = new FolderSelector({
    apiUrl: '/api/strm/list',
    title: "本地STRM",
    buildParams: (accountId, path, obj) => {
        return `?path=${path=='-11'?'':obj.currentPath.join('/')}`
    },
    buttons: [
        {
            text: '一键生成',
            class: 'modal-btn modal-btn-primary',
            action: 'confirm'
        },
        {
            text: '覆盖生成',
            class: 'btn-warning',
            action: 'overviewConfirm'
        },
        {
            text: '关闭',
            class: 'btn-default',
            action: 'cancel'
        }
    ],
    buttonCallbacks: {
        confirm: () => {
            generateAllStrm()
        },
        overviewConfirm: () => {
            // 自定义取消逻辑
            generateAllStrm(true)
        }
    }
});

function showStrm() {
    // document.getElementById('strmModal').style.display = 'block';
    strmFolderSelector.show(1);
}

function closeStrm() {
    strmFolderSelector.close()
}


async function generateAllStrm(overwrite = false) {
    try {
        const response = await fetch('/api/strm/generate-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                overwrite: overwrite
            })
        });
        message.success("执行中, 请稍后查看结果");
    } catch (error) {
        message.error('生成STRM失败: ' + error.message);
    }
}