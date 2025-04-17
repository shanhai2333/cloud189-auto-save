import { Application } from 'express';
import CloudSaverSDK from './sdk';
const { logTaskEvent } = require('../../utils/logUtils');
const sdk = new CloudSaverSDK();
export function setupCloudSaverRoutes(app: Application) {
    // 搜索接口
    app.get('/api/cloudsaver/search', async (req, res) => {
        try {
            const { keyword } = req.query;
            
            if (!keyword || typeof keyword !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '请提供搜索关键词'
                });
            }

            const results = await sdk.search(keyword);
            res.json({
                success: true,
                data: results
            });
        } catch (error) {
            logTaskEvent('CloudSaver 搜索失败:' +  error);
            res.json({
                success: false,
                error: '搜索失败:' + error
            });
        }
    });
}

export function clearCloudSaverToken() {
    sdk.setToken('');
}
// 暴露出sdk
export default sdk;