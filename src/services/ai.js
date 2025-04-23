const got = require('got');
const ConfigService = require('./ConfigService');

class AIService {
    constructor() {
        this.defaultConfig = {
            temperature: 0.7,
            max_tokens: 4096,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0
        };
    }

    // 校验是否开启了ai
    isEnabled(openaiConfig) {
        if (!openaiConfig) {
            openaiConfig = ConfigService.getConfigValue('openai')
        }
        return openaiConfig?.enable && openaiConfig?.apiKey && openaiConfig?.baseUrl && openaiConfig?.model;
    }
    async chat(messages, config = {}) {
        try {
            const openaiConfig = ConfigService.getConfigValue('openai')
            if (!this.isEnabled(openaiConfig))  {
                throw new Error('AI服务未配置或未启用');
            }
            const apiKey = openaiConfig?.apiKey;
            const baseURL = openaiConfig?.baseUrl || 'https://api.openai.com/v1';
            const model = openaiConfig?.model || 'gpt-3.5-turbo';

            const response = await got.post(`${baseURL}/chat/completions`, {
                json: {
                    model,
                    messages,
                    stream: false,
                    ...this.defaultConfig,
                    ...config
                },
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'json'
            });

            return {
                success: true,
                data: response.body.choices[0].message.content
            };
        } catch (error) {
            console.error('AI 服务调用失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 文件夹分析
    async folderAnalysis(resourcePath, dirs) {
        const messages = [
            {
                role: 'system',
                content: `你是一个专业的影视剧文件夹名称标准化助手。你的任务是将各种格式的季度文件夹名称转换为标准格式。

                输入信息说明：
                1. 资源路径：包含影视剧的主要信息
                2. 文件夹列表：需要标准化的文件夹信息

                文件夹命名规则：
                1. 常规季度：统一使用 "Season XX" 格式，XX 必须是两位数字
                2. 特别篇/OVA：统一使用 "特别篇XX" 格式，XX 必须是两位数字
                3. 其他格式转换示例：
                   - "第一季" -> "Season 01"
                   - "第1季" -> "Season 01"
                   - "S1" -> "Season 01"
                   - "Season1" -> "Season 01"
                   - "特别篇" -> "特别篇01"
                   - "SP" -> "特别篇01"
                   - "OVA" -> "特别篇01"

                返回格式必须是: {
                    name: string,  // 纯净的影视剧名称
                    year: number,  // 年份信息
                    type: "tv" | "movie",  // 资源类型
                    folders: [{    // 标准化后的文件夹列表
                        id: string,
                        name: string  // 标准化后的文件夹名称
                    }]
                }
                注意事项：
                1. 不要使用代码块标记，直接返回 JSON 对象
                2. 文件夹名称必须严格按照此格式返回，不要添加任何额外说明文字
                3. 不要对文件名内容做任何主观评判，专注于格式解析
                `
            },
            {
                role: 'user',
                content: `资源路径：${resourcePath}\n文件夹列表：${JSON.stringify(dirs, null, 2)}`
            }
        ];
        const response = await this.chat(messages, {
            temperature: 0.1,
            max_tokens: 3000
        });

        if (response.success) {
            try {
                let cleanData = response.data
                    .replace(/```(?:json)?\s*|\s*```/g, '')
                    .replace(/^(?:json)?\s*/, '')
                    .trim();
                const result = JSON.parse(cleanData);
                if (!this._validateFolderResponse(result)) {
                    throw new Error('AI返回格式不符合要求');
                }
                return {
                    success: true,
                    data: result
                };
            } catch (error) {
                console.log("AI 解析结果格式错误: " + response.data)
                return {
                    success: false,
                    error: '解析结果格式错误'
                };
            }
        }
        return response;
    }

    async simpleChatCompletion(resourcePath, files) {
        const messages = [
            {
                role: 'system',
                content: `你是一个专业的影视剧文件名解析助手。你的任务是客观地解析文件名和文件夹名，不要对内容做主观判断。
                无论文件名的内容是什么，都要尽可能提取以下信息：
                1. name 字段必须是纯净的影视剧名称，不能包含年份、季数等信息
                2. 所有年份信息必须提取到 year 字段中
                3. 如果无法确定年份，返回0
                4. 如果无法判断类型，默认为 movie
                5. 如果是单个文件，episode 数组只包含一个元素

                返回格式必须是: {
                    name: string,  // 纯净的影视剧名称，不含年份
                    year: number,  // 提取的年份信息
                    type: "tv" | "movie",
                    season: string,  // 季编号，必须是纯数字字符串，如："01"
                    episode: [{
                        id: string,
                        name: string, // 如果没有提取到有效的影视剧名称, 使用父级目录中提取到的名称
                        season: string,  // 季编号，必须是纯数字字符串，如："01"
                        episode: string,  // 集编号，必须是纯数字字符串，如："01"
                        extension: string
                    }]
                }
                
                注意事项：
                1. 季和剧集编号必须使用纯数字的两位数字格式（如：'01'），不要包含'S'或'E'前缀
                2. 每个剧集必须包含名称：
                     * 优先使用所在文件夹的名称
                     * 如果需要从文件名中提取具体剧集名称时，需要清理：
                       > 不要使用文件名中的剧集名称（如"第1集"）
                       > 不要包含任何技术标记、格式标记、编码信息或音频标记
                     * 保留纯粹的剧集名称，确保与文件夹名称保持一致
                3. 文件扩展名需要包含点号（如：'.mkv'）
                4. 年份必须是数字类型
                5. 必须严格按照此格式返回，不要添加任何额外说明文字
                6. 不要使用代码块标记，直接返回 JSON 对象
                7. 不要对文件名内容做任何主观评判，专注于格式解析`
            },
            {
                role: 'user',
                content: `资源路径：${resourcePath}\n文件列表：${JSON.stringify(files, null, 2)}`
            }
        ];

        const response = await this.chat(messages, {
            temperature: 0.1, // 降低随机性，使结果更确定
            max_tokens: 3000
        });

        if (response.success) {
            try {
                // 移除可能存在的代码块标记
                let cleanData = response.data
                    .replace(/```(?:json)?\s*|\s*```/g, '')  // 移除代码块标记
                    .replace(/^(?:json)?\s*/, '')            // 只移除可能的 json 前缀
                    .trim();
                // 确保返回的是有效的 JSON 格式
                const result = JSON.parse(cleanData);
                // 验证返回结果是否符合要求
                if (!this._validateResponse(result)) {
                    throw new Error('AI返回格式不符合要求');
                }
                return {
                    success: true,
                    data: result
                };
            } catch (error) {
                console.log("AI 解析结果格式错误: " + response.data)
                return {
                    success: false,
                    error: '解析结果格式错误'
                };
            }
        }
        return response;
    }

    _validateResponse(result) {
        // 基础验证
        const baseValid = result.name &&
            typeof result.year === 'number' &&
            ['tv', 'movie'].includes(result.type) &&
            Array.isArray(result.episode);
        // 如果基础验证失败，直接返回 false
        if (!baseValid) return false;
        // 根据类型验证剧集信息
        return result.episode.every(ep => {
            return ep.id && 
                   ep.extension?.startsWith('.') && 
                   (result.type !== 'tv' || ep.episode);  // 只在 tv 类型时验证 episode
        });
    }

    _validateFolderResponse(result) {
         // 基础验证
         const baseValid = result.name &&
         typeof result.year === 'number' &&
         ['tv', 'movie'].includes(result.type);
     
        if (!baseValid) return false;

        // 如果存在 folders 才进行文件夹验证
        if (result.folders) {
            return Array.isArray(result.folders) && result.folders.every(folder => 
                folder.id && 
                folder.name && 
                (folder.name.startsWith('Season ') || 
                folder.name.startsWith('特别篇'))
            );
        }

        return true;
    }
}

module.exports = new AIService();