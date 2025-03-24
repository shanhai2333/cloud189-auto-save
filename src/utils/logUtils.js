 // 记录任务日志
 const logTaskEvent = (message = null) => {
    if (!message) {
        return;
    }
    // 获取当前时间
    const currentTime = new Date();
    // 构建日志消息
    let logMessage = `[${currentTime.toLocaleString()}] ${message}`;
    console.log(logMessage);
}

module.exports = {
    logTaskEvent
}