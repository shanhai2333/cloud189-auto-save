const got = require('got');
const { logTaskEvent } = require('../utils/logUtils');
const ConfigService = require('./ConfigService');
// emby接口
class EmbyService {
    constructor() {
        this.embyUrl = ConfigService.getConfigValue('emby.serverUrl');
        this.embyApiKey = ConfigService.getConfigValue('emby.apiKey');
        this.embyPathReplace = ''
    }

    async notify(task) {
        const taskName = task.resourceName
        logTaskEvent(`执行Emby通知: ${taskName}`);
        // 处理路径
        this.embyPathReplace = task.account.embyPathReplace
        const path = this._replacePath(task.realFolderName)
        const item = await this.searchItemsByPathRecursive(path);
        logTaskEvent(`Emby搜索结果: ${ JSON.stringify(item)}`);
        if (item) {
            await this.refreshItemById(item.Id);
            return item.Id
        }else{
            logTaskEvent(`Emby未搜索到电影/剧集: ${taskName}, 执行全库扫描`);
            await this.refreshAllLibraries();
            return null;
        }
    }


    // 1. /emby/Items 根据名称搜索
    async searchItemsByName(name) {
        name = this._cleanMediaName(name);
        const url = `${this.embyUrl}/emby/Items`;
        const params = {
            SearchTerm: name,
            IncludeItemTypes: 'Movie,Series',
            Recursive: true,
            Fields: "Name",
        }
        const response = await this.request(url, {
            method: 'GET',
            searchParams: params,
        })
        return response;
    }

    // 2. /emby/Items/{ID}/Refresh 刷新指定ID的剧集/电影
    async refreshItemById(id) {
        const url = `${this.embyUrl}/emby/Items/${id}/Refresh`;
        await this.request(url, {
            method: 'POST',
        })
        return true;
    }

    // 3. 刷新所有库
    async refreshAllLibraries() {
        const url = `${this.embyUrl}/emby/Library/Refresh`;
        await this.request(url, {
            method: 'POST',
        })
        return true;
    }
    // 4. 根据路径搜索 /Items
    async searchItemsByPath(path) {
        const url = `${this.embyUrl}/Items`;
        const params = {
            Path: path,
            Recursive: true,
        }
        const response = await this.request(url, {
            method: 'GET',
            searchParams: params,
        })
        return response;
    }

    // 传入path, 调用searchItemsByPath, 如果返回结果为空, 则递归调用searchItemsByPath, 直到返回结果不为空
    async searchItemsByPathRecursive(path) {
        try {
            // 防止空路径
            if (!path) return null;
            // 移除路径末尾的斜杠
            const normalizedPath = path.replace(/\/+$/, '');
            // 搜索当前路径
            const result = await this.searchItemsByPath(normalizedPath);
            if (result?.Items?.[0]) {
                logTaskEvent(`在路径 ${normalizedPath} 找到媒体项`);
                return result.Items[0];
            }
            // 获取父路径
            const parentPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
            if (!parentPath) {
                logTaskEvent('已搜索到根路径，未找到媒体项');
                return null;
            }
            // 递归搜索父路径
            logTaskEvent(`在路径 ${parentPath} 继续搜索`);
            return await this.searchItemsByPathRecursive(parentPath);
        } catch (error) {
            logTaskEvent(`路径搜索出错: ${error.message}`);
            return null;
        }
    }

    // 统一请求接口
    async request(url, options) {
        try {
            const headers = {
                'Authorization': 'MediaBrowser Token="' + this.embyApiKey + '"',
            }
            const response = await got(url, {
                method: options.method,
                headers: headers,
                responseType: 'json',
                searchParams: options?.searchParams,
                form: options?.form,
                json: options?.json,
                throwHttpErrors: false // 禁用自动抛出HTTP错误
            });

            if (response.statusCode === 401) {
                logTaskEvent(`Emby认证失败: API Key无效`);
                return null;
            } else if (response.statusCode < 200 || response.statusCode >= 300) {
                logTaskEvent(`Emby接口请求失败: 状态码 ${response.statusCode}`);
                return null;
            }
            return response.body;
        } catch (error) {
            logTaskEvent(`Emby接口请求异常: ${error.message}`);
            return null;
        }
    }

    // 处理媒体名称，去除年份、清晰度等信息
    _cleanMediaName(name) {
        return name
            // 移除括号内的年份，如：沙尘暴 (2025)
            .replace(/\s*[\(\[【］\[]?\d{4}[\)\]】］\]]?\s*/g, '')
            // 移除清晰度标识，如：4K、1080P、720P等
            .replace(/\s*[0-9]+[Kk](?![a-zA-Z])/g, '')
            .replace(/\s*[0-9]+[Pp](?![a-zA-Z])/g, '')
            // 移除其他常见标识，如：HDR、HEVC等
            .replace(/\s*(HDR|HEVC|H265|H264|X265|X264|REMUX)\s*/gi, '')
            // 移除额外的空格
            .trim();
    }
    // 路径替换
    _replacePath(path) {
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        if (this.embyPathReplace) {
            const pathReplaceArr = this.embyPathReplace.split(';');
            for (let i = 0; i < pathReplaceArr.length; i++) {
                const pathReplace = pathReplaceArr[i].split(':');
                path = path.replace(pathReplace[0], pathReplace[1]);
            }
        }
        // 如果结尾有斜杠, 则移除
        path = path.replace(/\/+$/, '');
        return path;
    }

}
module.exports = { EmbyService };