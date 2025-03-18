const { CloudClient, FileTokenStore } = require('cloud189-sdk');
const crypto = require('crypto');
class Cloud189Service {
    static instances = new Map();

    static getInstance(account) {
        const key = account.username;
        if (!this.instances.has(key)) {
            this.instances.set(key, new Cloud189Service(account));
        }
        return this.instances.get(key);
    }

    constructor(account) {
        this.client = new CloudClient({ 
            username: account.username,
            password: account.password,
            token: new FileTokenStore(`data/${account.username}.json`)
            }
        );
    }

    // 解析分享链接获取文件信息
    async getShareInfo(shareCode) {
        const response = await this.client.request.get('https://cloud.189.cn/api/open/share/getShareInfoByCodeV2.action', {
            searchParams: { shareCode },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

    // 获取分享目录下的文件列表
    async listShareDir(shareId, fileId, shareMode, accessCode) {
        const response = await this.client.request.get('https://cloud.189.cn/api/open/share/listShareDir.action', {
            searchParams: {
                shareId,
                isFolder: true,
                fileId: fileId,
                orderBy: 'lastOpTime',
                descending: true,
                shareMode: shareMode,
                pageNum: 1,
                pageSize: 1000,
                accessCode
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

    // 递归获取所有文件列表
    async getAllShareFiles(shareId, fileId, shareMode, accessCode) {
        const result = await this.listShareDir(shareId, fileId, shareMode, accessCode);
        if (!result || (!result.fileListAO.folderList && !result.fileListAO.fileList)) {
            return [];
        }

        let allFiles = [...result.fileListAO.fileList];

        // 递归获取子文件夹中的文件
        for (const floder of result.fileListAO.folderList) {
            const subFiles = await this.getAllShareFiles(shareId, floder.id, shareMode, accessCode);
                allFiles = allFiles.concat(subFiles);
        }

        return allFiles;
    }

    // 搜索个人网盘文件
    async searchFiles(filename) {
        const response = await this.client.request('https://cloud.189.cn/api/open/file/searchFiles.action', {
            searchParams: {
                folderId: '-11',
                pageSize: '1000',
                pageNum: '1',
                recursive: 1,
                mediaType: 0,
                filename
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

    // 获取个人网盘文件列表
    async listFiles(folderId) {
        const response = await this.client.request.get('https://cloud.189.cn/api/open/file/listFiles.action', {
            searchParams: {
                folderId,
                mediaType: 0,
                orderBy: 'lastOpTime',
                descending: true,
                pageNum: 1,
                pageSize: 1000
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

    // 创建转存任务
    async createSaveTask(taskInfos, targetFolderId, shareId) {
        console.log("========== 开始创建转存任务 ============")
        console.log("taskInfos: ", taskInfos)
        console.log("targetFolderId: ", targetFolderId)
        console.log("shareId: ", shareId)
        const response = await this.client.request('https://cloud.189.cn/api/open/batch/createBatchTask.action', {
            method: 'POST',
            form: {
                type: 'SHARE_SAVE',
                taskInfos,
                targetFolderId,
                shareId
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

    // 查询转存任务状态
    async checkTaskStatus(taskId) {
        const params = {taskId: taskId, type: 'SHARE_SAVE'}
        const response = await this.client.request('https://cloud.189.cn/api/open/batch/checkBatchTask.action', {
            method: 'POST',
            form: params,
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

    // 获取目录树节点
    async getFolderNodes(folderId = '-11') {
        const response = await this.client.request('https://cloud.189.cn/api/portal/getObjectFolderNodes.action', {
            method: 'POST',
            form: {
                id: folderId,
                orderBy: 1,
                order: 'ASC'
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }

    // 新建目录
    async createFolder(folderName, parentFolderId) {
        const response = await this.client.request('https://cloud.189.cn/api/open/file/createFolder.action', {
            method: 'POST',
            form: {
                parentFolderId: parentFolderId,
                folderName: folderName
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            },
        }).json();
        return response;
    }

     // 验证分享链接访问码
     async checkAccessCode(shareCode, accessCode) {
        const response = await this.client.request.get('https://cloud.189.cn/api/open/share/checkAccessCode.action', {
            searchParams: {
                shareCode,
                accessCode,
                uuid: crypto.randomUUID()
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response;
    }
    // 获取冲突的文件 
    async getConflictTaskInfo(taskId) {
        const response = await this.client.request('https://cloud.189.cn/api/open/batch/getConflictTaskInfo.action', {
            method: 'POST',
            json: {
                taskId,
                type: 'SHARE_SAVE'
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response
    }

    // 处理冲突 taskInfos: [{"fileId":"","fileName":"","isConflict":1,"isFolder":0,"dealWay":1}]
    async manageBatchTask(taskId,targetFolderId, taskInfos) {
        const response = await this.client.request('https://cloud.189.cn/api/open/batch/manageBatchTask.action', {
            method: 'POST',
            json: {
                taskId,
                type: 'SHARE_SAVE',
                targetFolderId,
                taskInfos
            },
            headers: {
                'Accept': 'application/json;charset=UTF-8'
            }
        }).json();
        return response
    }


    // 重命名文件
    async renameFile(fileId, destFileName) {
        try{
            const response = await this.client.request('https://cloud.189.cn/api/open/file/renameFile.action', {
                method: 'POST',
                form: {
                    fileId,
                    destFileName
                },
                headers: {
                    'Accept': 'application/json;charset=UTF-8'
                }
            }).json();
            return response;
        }catch(e){
            if (JSON.parse(e.response.body).res_code == "FileAlreadyExists") {
                return {
                    res_code: "FileAlreadyExists",
                    res_msg: "文件已存在"
                }
            }
            throw e;
        }
    }
}

module.exports = { Cloud189Service };