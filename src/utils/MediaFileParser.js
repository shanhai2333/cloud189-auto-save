const path = require('path');
const { Segment, useDefault } = require('segmentit');
const segmentit = useDefault(new Segment());

class MediaTypeDetector {

   // 技术术语停用词（支持正则表达式）
   static TECH_STOPWORDS = [
    'HDR', '全集', '高清', '修复版', '导演剪辑版', '蓝光',
    '4K', '1080p', '720p', 'x\\d{3,4}', 'AVC', 'HEVC', 'H\\.?264', 'H\\.?265',
    'BDRip', 'WEB[- ]?DL', 'WEB[- ]?Rip', 'Blu[- ]?Ray', 'BRRip', 'Remux', 
    '2160p', 'AAC', 'UHD', 'Dolby', 'Atmos', 'DTS', 'MA', 'AC3', 
    '5\\.1', '2\\.0', '7\\.1', 'TrueHD', 'EAC3', 'FLAC', 'DTS:X', 'BD', 'HD',
    '\\d+bit'
  ];

  // 语义保留词白名单
  static KEEP_WORDS = new Set([
    '之', '的', '与', '和', // 中文
    'OF', 'AND', 'THE'     // 英文
  ]);

  // 预编译技术术语正则
  static TECH_REGEX = new RegExp(
    `(?:^|[^a-zA-Z])(${this.TECH_STOPWORDS.join('|')})(?=$|[^a-zA-Z])`,
    'gi'
  );

  /**
   * @param {Object} params - 包含 filename 和 dirPath
   * @returns {Object} 
   *   - 电影: { type: 'movie', name: string, year: number|null, extension: string }
   *   - 剧集: { type: 'tv', name: string, year: number|null, season: string|null, episode: string|null, extension: string }
   */
  static detect({ filename, dirPath = '' }) {
    const extension = path.extname(filename).replace('.', '')?.trim();
    const basename = path.basename(filename, path.extname(filename))?.trim();

    // 1. 智能提取名称（优先文件名，其次目录名）
    let name = this._extractCleanName(basename);
    if (!name || this._isTechnical(name)) {
      name = this._extractCleanNameFromPath(dirPath);
    }

    // 2. 判断类型和提取元数据
    const type = this._determineType(basename, dirPath);
    const result = {
      type,
      name: name || '未知名称',
      year: this._extractYear(basename) || this._extractYear(dirPath),
      extension
    };

    // 3. 剧集专属字段
    if (type === 'tv') {
      Object.assign(result, {
        season: this._extractSeason(basename) || this._extractSeason(dirPath),
        episode: this._extractEpisode(basename)
      });
    }

    return result;
  }


  static _extractCleanName(text) {
    if (!text) return null;

    // 1. 移除季集标记（支持多种格式）
    let cleaned = text
      .replace(/(?:^|\s|[._-])+(?:S\d+E\d+|EP?\d+|第\s*\d+\s*集)(?:\s|[._-])*/gi, ' ')
      .replace(/(?:^|\s|[._-])+\d{3,4}p(?:\s|[._-])*/gi, ' ');

    // 2. 移除技术术语
    cleaned = cleaned.replace(this.TECH_REGEX, ' ');

    // 3. 移除年份
    cleaned = cleaned.replace(/(?:^|\s|[._-])+(19|20)\d{2}(?:\s|[._-])*/g, ' ');

    // 4. 提取有效名称部分
    const nameMatch = cleaned.match(/[\u4e00-\u9fa5a-zA-Z][\u4e00-\u9fa5a-zA-Z\s]+/);
    return nameMatch ? this._normalizeName(nameMatch[0]) : null;
  }

  // -- 从路径提取名称 --
  static _extractCleanNameFromPath(dirPath) {
    const dirs = dirPath.split(path.sep);
    
    // 从后向前查找第一个有效目录名
    for (let i = dirs.length - 1; i >= 0; i--) {
      const dir = dirs[i];
      if (!dir || this._isTvShowDir(dir)) continue;

      const name = this._extractCleanName(dir);
      if (name && !this._isTechnical(name)) return name;
    }
    return null;
  }

  // -- 名称标准化 --
  static _normalizeName(name) {
    // 1. 统一分隔符
    name = name.replace(/[._-]+/g, ' ').trim();
    
    // 2. 中文分词处理
    if (/[\u4e00-\u9fa5]/.test(name)) {
      const words = segmentit.doSegment(name, { simple: true });
      return words
        .filter(word => word.length > 1 || this.KEEP_WORDS.has(word))
        .join('');
    }
    
    // 3. 英文处理：首字母大写
    return name.toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // -- 私有方法 --
  static _extractTitle(text) {
    if (!text) return null;
    const stopWordsRegex = new RegExp(this.TECH_STOPWORDS.map(word => {
        if (word.includes('\\d+')) {
            return word;
        }
        return `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
    }).join('|'), 'gi');
    return text
       .replace(stopWordsRegex, '')
       .replace(/(19|20)\d{2}/, '')      // 去掉年份
       .replace(/(S\d+E\d+|EP?\d+)/i, '') // 去掉季集标记
       .replace(/[\[\](){}._-]+/g, ' ')   // 替换分隔符为空格
       .trim();
  }

  // -- 私有方法 --
  static _extractSeason(text) {
    const matches = text.match(/(?:S|Season|第)(\d{1,2})/i);
    return matches ? matches[1].padStart(2, '0') : null;
  }

  static _extractEpisode(text) {
    const matches = text.match(/(?:E|EP|第)(\d{1,3})(?:集)?/i);
    return matches ? matches[1].padStart(2, '0') : null;
  }

  static _determineType(filename, dirPath) {
    if (this._hasEpisodeMarkers(filename)) return 'tv';
    if (this._isTvShowDir(dirPath)) return 'tv';
    return 'movie'; // 默认回退为电影
  }

  static _cleanTitle(title) {
    if (!title) return null;
    const words = segmentit.doSegment(title, {
        simple: true,          // 返回单词数组
        stripPunctuation: true, // 自动去除标点
        stripStopword: false    // 自动过滤停用词
      });
  
      return words
           .filter(word => {
                const upperWord = word.toUpperCase();
                const isTechnical = this.TECH_STOPWORDS.some(stopWord => new RegExp(`\\b${stopWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(upperWord));
                const isKeepWord = this.KEEP_WORDS.has(upperWord);
                return (!isTechnical) && (word.length > 0 || isKeepWord);
            })
           .join('');
  }
  // -- 私有方法 --
  static _hasEpisodeMarkers(text) {
    // 匹配 S01E02 / 第3集 / EP05 等格式
    return /(S\d+E\d+|EP?\d+|第[\d一二三四五六七八九十]+集)/i.test(text);
  }

  static _isTvShowDir(dirPath) {
    // 目录包含 Season/季 等关键词
    return /(Season|S\d+|Season|第[\d一二三四五六七八九十]+季)/i.test(dirPath);
  }

  static _extractYear(text) {
    // 匹配 1990-2030 之间的年份
    const match = text.match(/(?:^|[^\d])(19|20)(\d{2})(?:[^\d]|$)/);
    return match ? parseInt(match[1] + match[2]) : null;
  }

  static _extractYearFromDir(dirPath) {
    // 从父目录名提取年份（如 /Movies (2023)/）
    return this._extractYear(path.dirname(dirPath));
  }

  static _guessByFilename(text) {
    // 规则1：包含 "季"/"Season" 则认为是剧集
    if (/第[\d一二三四五六七八九十]+季|Season/i.test(text)) return 'tv';

    // 规则2：中文常见剧集关键词
    const tvKeywords = ['剧集', '全集', '连载', ' episodes'];
    if (new RegExp(tvKeywords.join('|')).test(text)) return 'tv';

    // 规则3：英文常见电影关键词
    const movieKeywords = ['film', 'movie', 'feature', '剧场版'];
    if (new RegExp(movieKeywords.join('|'), 'i').test(text)) return 'movie';

    // 规则4：通过标题长度和数字特征
    const cleanTitle = this._cleanText(text);
    const hasSequentialNumbers = /\d{3,}/.test(cleanTitle); // 连续3个以上数字可能是剧集
    return hasSequentialNumbers ? 'tv' : 'movie';
  }

  static _cleanText(text) {
    // 移除干扰符号（保留中文、英文、数字）
    return text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  }

  static _isTechnical(text) {
    if (!text) return false;
    return this.TECH_STOPWORDS.some(stopWord => {
        const regexPattern = stopWord.includes('\\d+') ? stopWord : `\\b${stopWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
        return new RegExp(regexPattern, 'i').test(text.toUpperCase());
    });
  }
}
module.exports = MediaTypeDetector;