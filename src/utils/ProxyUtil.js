const ConfigService = require('../services/ConfigService');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');

class ProxyUtil {
    static getProxy() {
        let proxy = null;
        const proxyConfig = ConfigService.getConfigValue('proxy');
        const { type = 'http', host, port, username, password } = proxyConfig;
        if (host && port) {
            let proxyUrl = `${type}://${host}:${port}`;
            if (username && password) {
                proxyUrl = `${type}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
            }
            proxy = proxyUrl;
        }
        return proxy;
    }
    static getProxyAgent() {
        const proxy = this.getProxy();
        return !proxy?{}:{
            http: new HttpProxyAgent(proxy),
            https: new HttpsProxyAgent(proxy)
        }
    }
}

module.exports = ProxyUtil;