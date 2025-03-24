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
    }

    validate() {
        if (!this.accountId) throw new Error('账号ID不能为空');
        if (!this.shareLink) throw new Error('分享链接不能为空');
        if (!this.targetFolderId) throw new Error('目标目录不能为空');
        if (this.matchPattern && !this.matchValue) throw new Error('填了匹配模式, 那么匹配值就必须填');
        if (this.matchOperator && !['lt', 'eq', 'gt'].includes(this.matchOperator)) {
            throw new Error('无效的匹配操作符');
        }
    }
}

module.exports = { CreateTaskDto };