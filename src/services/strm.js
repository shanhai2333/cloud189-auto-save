const fs = require('fs').promises;
const path = require('path');
const ConfigService = require('./ConfigService');
const { logTaskEvent } = require('../utils/logUtils');

class StrmService {
    constructor() {
        this.baseDir = path.join(__dirname + '../../../strm');
        this.prefix = ConfigService.getConfigValue('strm.prefix');
    }

    /**
     * 生成 STRM 文件
     * @param {Array} files - 文件列表，每个文件对象需包含 name 属性
     * @param {boolean} overwrite - 是否覆盖已存在的文件
     * @returns {Promise<Array>} - 返回生成的文件列表
     */
    async generate(files, overwrite = false) {
        logTaskEvent(`开始生成STRM文件, 总文件数: ${files.length}`);
        const results = [];
        let success = 0;
        let failed = 0;
        let skipped = 0;
        try {
            // 确保基础目录存在
            await fs.mkdir(this.baseDir, { recursive: true });
            // mediaSuffixs转为小写
            const mediaSuffixs = ConfigService.getConfigValue('task.mediaSuffix').split(';').map(suffix => suffix.toLowerCase())
            for (const file of files) {
                // 检查文件是否是媒体文件
                if (!this._checkFileSuffix(file, mediaSuffixs)) {
                    logTaskEvent(`文件不是媒体文件，跳过: ${file.name}`);
                    skipped++
                    continue;
                }
                try {
                    const fileName = file.name;
                    const parsedPath = path.parse(fileName);
                    const dirPath = parsedPath.dir;
                    const fileNameWithoutExt = parsedPath.name;
                    
                    // 构建完整的目标目录路径
                    const targetDir = path.join(this.baseDir, dirPath);
                    // 确保目标目录存在
                    await fs.mkdir(targetDir, { recursive: true });
                    
                    const strmPath = path.join(targetDir, `${fileNameWithoutExt}.strm`);

                    // 检查文件是否存在
                    try {
                        await fs.access(strmPath);
                        if (!overwrite) {
                            logTaskEvent(`STRM文件已存在，跳过: ${strmPath}`);
                            skipped++
                            continue;
                        }
                    } catch (err) {
                        // 文件不存在，继续处理
                    }

                    // 生成STRM文件内容
                    const content = path.join(this.prefix,fileName);
                    await fs.writeFile(strmPath, content, 'utf8');
                    results.push({
                        originalFile: fileName,
                        strmFile: `${fileNameWithoutExt}.strm`,
                        path: strmPath
                    });
                    logTaskEvent(`生成STRM文件成功: ${strmPath}`);
                    success++
                } catch (error) {
                    logTaskEvent(`生成STRM文件失败: ${file.name}, 错误: ${error.message}`);
                    failed++
                }
            }
        } catch (error) {
            logTaskEvent(`生成STRM文件失败: ${error.message}`);
        }
        // 记录文件总数, 成功数, 失败数, 跳过数
        logTaskEvent(`生成STRM文件完成, 总文件数: ${files.length}, 成功数: ${success}, 失败数: ${failed}, 跳过数: ${skipped}`);
        return results;
    }

    /**
     * 删除STRM文件
     * @param {string} fileName - 原始文件名
     * @returns {Promise<void>}
     */
    async delete(fileName) {
        const parsedPath = path.parse(fileName);
        const dirPath = parsedPath.dir;
        const fileNameWithoutExt = parsedPath.name;
        const strmPath = path.join(this.baseDir, dirPath, `${fileNameWithoutExt}.strm`);
        
        try {
            await fs.unlink(strmPath);
            logTaskEvent(`删除STRM文件成功: ${strmPath}`);
            
            // 尝试删除空目录
            const targetDir = path.join(this.baseDir, dirPath);
            const files = await fs.readdir(targetDir);
            if (files.length === 0) {
                await fs.rmdir(targetDir);
                logTaskEvent(`删除空目录: ${targetDir}`);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw new Error(`删除STRM文件失败: ${error.message}`);
            }
        }
    }
    //检查文件是否是媒体文件
    _checkFileSuffix(file, mediaSuffixs) {
         // 获取文件后缀
         const fileExt = '.' + file.name.split('.').pop().toLowerCase();
         return mediaSuffixs.includes(fileExt)
    }
}

module.exports = { StrmService };