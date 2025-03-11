const { DataSource } = require('typeorm');
const { Account, Task } = require('../entities').default;
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const AppDataSource = new DataSource({
    type: 'sqlite',
    database: process.env.DB_PATH || path.join(__dirname, '../../data/database.sqlite'),
    synchronize: true,
    logging: false,
    entities: [Account, Task],
    subscribers: [],
    migrations: []
});

const initDatabase = async () => {
    try {
        await AppDataSource.initialize();
        console.log('数据库连接成功');
    } catch (error) {
        console.error('数据库连接失败:', error);
        process.exit(1);
    }
};

const getAccountRepository = () => AppDataSource.getRepository(Account);
const getTaskRepository = () => AppDataSource.getRepository(Task);

module.exports = {
    AppDataSource,
    initDatabase,
    getAccountRepository,
    getTaskRepository
};