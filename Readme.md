# cloud189-auto-save

天翼云盘自动转存系统，支持自动监控更新并转存文件。

## 功能特点

- 支持多账号管理
- 自动监控分享链接更新, 自动重命名
- 支持企业微信、Telegram 消息推送
- Web 界面管理，响应式布局, 操作便捷
- Docker 部署，方便维护

## 快速开始

### 配置文件

修改 `.env.example` 文件为 `.env`，然后配置以下参数：

```plaintext
# Web 认证信息
AUTH_USERNAME=admin    # 网页登录用户名
AUTH_PASSWORD=password # 网页登录密码

# 任务检查间隔（Cron 表达式）
TASK_CHECK_INTERVAL=*/30 * * * *
```

## Docker 部署

### 直接使用镜像

```bash
docker run -d \
  -v /yourpath/data:/home/data \
  -v /yourpath/.env:/home/.env \
  -p 3000:3000 \
  --restart unless-stopped \
  --name cloud189 \
  xia1307/cloud189-auto-save
  ```
注意: 镜像构建不那么及时, 最好自行构建, 或者下载源码, 将源码的src目录挂载到/home/src

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
4. 重命名功能:
   - 点击任务卡片中的更新目录
   - 任意勾选文件
   - 点击批量重命名按钮
   - 选择重命名方式(正则表达式或顺序重命名)
   - 点击确定进行预览或点击保存并自动更新(正则表达式支持后续自动更新, 后续任务新增剧集会根据正则表达式重命名)
   - 预览重命名后的文件名
   - 点击确定
5. 系统会自动检查更新并转存文件
6. 支持手动触发任务执行
7. 支持Cookie登录:
   使用方法: 
   1. 打开天翼云盘官网登录界面
   2. 打开浏览器的开发者工具(ctrl+f12), 勾选保留日志
   3. 正常发起登录, 然后在开发者工具中选择网络(network)
   4. 在请求中找到loginSubmit.do, 点击打开详情
   5. 拿到详情中的set-cookie: SSON=xxxxx, 只复制xxxx即可, 不要带上SSON
   6. 填入账号创建中的cookie中即可

## 截图
<img width="1505" alt="image" src="https://github.com/user-attachments/assets/359fb6e2-0d38-4a4c-a398-1b820ce47c8c" />
<img width="1391" alt="image" src="https://github.com/user-attachments/assets/03826fc6-ac19-442e-a325-ce22250fdb5e" />
<img width="1327" alt="image" src="https://github.com/user-attachments/assets/8a05ff40-4f70-42a9-9a70-74d9e04f3f64" />
<img width="1354" alt="image" src="https://github.com/user-attachments/assets/c6ddfede-17b2-43eb-838d-de4b1cf93b04" />
<img width="1297" alt="image" src="https://github.com/user-attachments/assets/13380003-2295-4dfb-9d6c-d9229399f8b6" />

## 注意事项

- 请确保 `.env` 文件权限设置正确
- 更新目录可以任意移动但不能被删除, 否则任务无法执行; 
- 数据库文件会持久化保存在宿主机
- 支持容器自动重启
- 推荐使用反向代理进行安全访问

## License

MIT