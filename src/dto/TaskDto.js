class CreateTaskDto {
    constructor(data) {
        this.accountId = data.accountId;
        this.shareLink = data.shareLink;
        this.targetFolderId = data.targetFolderId;
        this.totalEpisodes = data.totalEpisodes;
        this.accessCode = data.accessCode;
        this.matchPattern = data.matchPattern;
        this.matchOperator = data.matchOperator;
        this.matchValue = data.matchValue;
        this.overwriteFolder = data.overwriteFolder;
        this.remark = data.remark;
        this.enableCron = data.enableCron;
        this.cronExpression = data.cronExpression;
        this.realRootFolderId = data.realRootFolderId;
        this.targetFolder = data.targetFolder;
        this.selectedFolders = data.selectedFolders; // 选中的分享目录
        this.tgbot = data?.tgbot;
    }

    validate() {
        if (!this.accountId) throw new Error('账号ID不能为空');
        if (!this.shareLink) throw new Error('分享链接不能为空');
        if (!this.targetFolderId) throw new Error('目标目录不能为空');
        if (this.matchPattern && !this.matchValue) throw new Error('填了匹配模式, 那么匹配值就必须填');
        if (this.matchOperator && !['lt', 'eq', 'gt'].includes(this.matchOperator)) {
            throw new Error('无效的匹配操作符');
        }
        if (!this.tgbot && (!this.selectedFolders || this.selectedFolders.length === 0)) {
            throw new Error('分享目录最少选择一个');
        }
    }
}

module.exports = { CreateTaskDto };