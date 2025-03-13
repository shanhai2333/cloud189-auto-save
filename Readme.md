# cloud189-auto-save

天翼云盘自动转存系统，支持自动监控更新并转存文件。

## 功能特点

- 支持多账号管理
- 自动监控分享链接更新
- 支持企业微信、Telegram 消息推送
- Web 界面管理，操作便捷
- Docker 部署，方便维护

## 快速开始

### 配置文件

修改 `.env.example` 文件为 `.env`，然后配置以下参数：

```plaintext
# Web 认证信息
AUTH_USERNAME=admin    # 网页登录用户名
AUTH_PASSWORD=password # 网页登录密码

# 企业微信推送配置（可选）
WECOM_WEBHOOK=your_webhook_url

# Telegram 推送配置（可选）
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Telegram 代理配置（可选）  或可通过cf反向代理绕墙 可免http代理
CF_PROXY_DOMAIN=
PROXY_TYPE=
PROXY_HOST=
PROXY_PORT=
PROXY_USERNAME=
PROXY_PASSWORD=

# 任务检查间隔（Cron 表达式）
TASK_CHECK_INTERVAL=*/30 * * * *
```

### Docker 部署

1. 构建镜像
```bash
docker build -t cloud189_auto_save .
```

2. 运行容器
```bash
docker run -d \
  -v /host/path/database.sqlite:/home/data/database.sqlite \
  -v /host/path/.env:/home/.env \
  -p 3000:3000 \
  --restart unless-stopped \
  --name cloud189 \
  cloud189-auto-save
```

### 访问系统

浏览器访问 `http://localhost:3000`，使用 `.env` 中配置的用户名和密码登录。

## 使用说明

1. 添加天翼云盘账号
2. 创建转存任务，填写：
   - 选择账号
   - 分享链接
   - 视频类型
   - 保存目录
   - 总集数（可选）
3. 首次创建任务会自动识别分享链接中的文件和目录, 并在保存目录中创建相同目录, 任务也会相对应创建为多个任务
4. 系统会自动检查更新并转存文件
5. 支持手动触发任务执行

## 注意事项

- 请确保 `.env` 文件权限设置正确
- 更新目录可以任意移动但不能被删除, 否则任务无法执行; 
- 数据库文件会持久化保存在宿主机
- 支持容器自动重启
- 推荐使用反向代理进行安全访问

## License

MIT