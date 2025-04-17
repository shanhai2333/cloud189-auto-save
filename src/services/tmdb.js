const got = require('got');
const ConfigService = require('./ConfigService');

class TMDBService {
    constructor() {
        this.apiKey = ConfigService.getConfigValue('tmdb.apiKey');
        this.baseURL = 'https://api.themoviedb.org/3';
        this.language = 'zh-CN';
    }

    async search(title, year = '') {
        try {
            console.log(`TMDB搜索：${title}，年份：${year}`);
            const response = await got(`${this.baseURL}/search/multi`, {
                searchParams: {
                    api_key: this.apiKey,
                    query: title,
                    language: this.language,
                    year: year
                }
            }).json();

            console.log(`TMDB搜索结果数量：${response.results.length}`);
            
            // 分离电影和电视剧结果
            const movies = response.results
                .filter(item => item.media_type === 'movie')
                .map(item => ({
                    id: item.id,
                    title: item.title,
                    originalTitle: item.original_title,
                    overview: item.overview,
                    releaseDate: item.release_date,
                    posterPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : 'https://image.tmdb.org/t/p/w500/sbVz38IKvmSyTNrxc7Qb4vWuMzW.jpg',
                    voteAverage: item.vote_average,
                    type: 'movie'
                }));

            const tvShows = response.results
                .filter(item => item.media_type === 'tv')
                .map(item => ({
                    id: item.id,
                    title: item.name,
                    originalTitle: item.original_name,
                    overview: item.overview,
                    releaseDate: item.first_air_date,
                    posterPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : 'https://image.tmdb.org/t/p/w500/sbVz38IKvmSyTNrxc7Qb4vWuMzW.jpg',
                    voteAverage: item.vote_average,
                    type: 'tv'
                }));

            return {
                movies: movies.slice(0, 5),
                tvShows: tvShows.slice(0, 5)
            };
        } catch (error) {
            throw new Error(`TMDB搜索失败: ${error.message}`);
        }
    }

    async _searchMedia(type, title, year) {
        console.log(`TMDB搜索${type}：${title}，年份：${year}`);
        // 发起搜索请求
        const searchPromise = got(`${this.baseURL}/search/${type}`, {
            searchParams: {
                api_key: this.apiKey,
                query: title,
                language: this.language,
                year: year
            }
        }).json();
        
        // 并发执行搜索请求和其他操作
        const [response] = await Promise.all([searchPromise]);
        
        console.log(`TMDB搜索${type}结果数量：${response.results.length}`);
        
        // 过滤和排序结果
        const filteredResults = response.results
            .filter(item => {
                const itemTitle = type === 'movie' ? item.title : item.name;
                const itemOriginalTitle = type === 'movie' ? item.original_title : item.original_name;
                const searchTitle = title.toLowerCase();
                return itemTitle.toLowerCase().includes(searchTitle) || 
                       itemOriginalTitle.toLowerCase().includes(searchTitle);
            })
            .sort((a, b) => {
                const titleA = (type === 'movie' ? a.title : a.name).toLowerCase();
                const titleB = (type === 'movie' ? b.title : b.name).toLowerCase();
                const searchTitle = title.toLowerCase();
                
                if (titleA === searchTitle && titleB !== searchTitle) return -1;
                if (titleB === searchTitle && titleA !== searchTitle) return 1;
                return b.popularity - a.popularity;
            });

        console.log(`TMDB搜索${type}过滤结果数量：${filteredResults.length}`);

        // 并发处理所有结果
        const promises = filteredResults.slice(0, 5).map(item => ({
            id: item.id,
            title: type === 'movie' ? item.title : item.name,
            originalTitle: type === 'movie' ? item.original_title : item.original_name,
            overview: item.overview,
            releaseDate: type === 'movie' ? item.release_date : item.first_air_date,
            posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : null,
            voteAverage: item.vote_average,
            type: type
        }));

        const data = await Promise.all(promises);
        console.log(`TMDB搜索${type}最终结果数量：${data.length}`);
        return data;
    }

    async _getDetails(type, id) {
        if (type === 'movie') {
            return;
        }
        const response = await got(`${this.baseURL}/${type}/${id}`, {
            searchParams: {
                api_key: this.apiKey,
                language: this.language
            }
        }).json();
        return response;
    }
}

module.exports = { TMDBService };