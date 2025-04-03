class BatchTaskDto {
    constructor(data) {
        this.taskInfos = data.taskInfos;
        this.type = data.type;
        this.targetFolderId = data?.targetFolderId || null;
        this.shareId = data?.shareId || null;
    }

    validate() {
        if (!this.taskInfos) throw new Error('任务信息不能为空');
        if (!this.type) throw new Error('任务类型不能为空');
    }
}

module.exports = { BatchTaskDto };