const { ProxyFile } = require('../entities');
const { In } = require('typeorm');

class ProxyFileService {
    constructor(proxyFileRepo) {
        this.proxyFileRepo = proxyFileRepo;
    }

    // 根据taskId获取所有代理文件
    async getFilesByTaskId(taskId) {
        return await this.proxyFileRepo.find({
            where: {
                taskId: taskId
            }
        });
    }

    // 批量新增代理文件
    async batchCreateFiles(files) {
        // files格式: [{id, taskId, name, md5, size}]
        const proxyFiles = files.map(file => {
            const proxyFile = new ProxyFile();
            proxyFile.id = file.id;
            proxyFile.taskId = file.taskId;
            proxyFile.name = file.name;
            proxyFile.md5 = file.md5;
            proxyFile.size = file.size;
            proxyFile.lastOpTime = file.lastOpTime;
            return proxyFile;
        });
        return await this.proxyFileRepo.save(proxyFiles);
    }

    // 删除代理文件
    async deleteFiles(taskId) {
       await this.proxyFileRepo.delete({
            taskId: taskId
        });
    }
    // 批量删除代理文件
    async batchDeleteFiles(taskIds) {
        await this.proxyFileRepo.delete({
            taskId: In(taskIds) // 使用 In 操作符处理数组
        });
    }

    // 重命名文件
    async renameFiles(task) {
        const files = await this.getFilesByTaskId(task.id);
        const newFiles = [];
        const message = []; 
        const renameFile = [];
        for (const file of files) {
            const destFileName = file.name.replace(task.matchPattern, task.matchValue);
            if (destFileName === file.name){
                newFiles.push(file)
                continue;
            }
            file.name = destFileName;
            renameFile.push(file)
            // await this.proxyFileRepo.save(file);
            message.push(` > ${file.name} → ${destFileName}`)
            newFiles.push({
                ...file,
                name: destFileName
            });
        }
        if (renameFile.length > 0){
            await this.batchUpdateFiles(renameFile)
        }
        return { message, newFiles}
    }

    async batchUpdateFiles(files) {
        return await this.proxyFileRepo.save(files);
    }
    // 根据文件id批量删除文件
    async batchDeleteFilesById(fileIds) {
        await this.proxyFileRepo.delete({
            id: In(fileIds) // 使用 In 操作符处理数组
        });
    }
}

module.exports = { ProxyFileService };