class TaskCompleteEventDto  {
    constructor(data) {
        this.cloud189 = data?.cloud189;
        this.task = data?.task;
        this.fileList = data?.fileList;
        this.overwriteStrm = data?.overwriteStrm;
    }
}

module.exports = { TaskCompleteEventDto };