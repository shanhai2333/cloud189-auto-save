# 使用Node.js v16.19.0作为基础镜像
FROM node:16.19.0-slim

# 设置工作目录
WORKDIR /home

# 复制package.json和yarn.lock
COPY package.json yarn.lock ./

# 更换为国内镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装必要的依赖项
RUN apk add --update --no-cache ca-certificates

# 安装依赖
RUN yarn install

# 复制源代码
COPY src ./src

# 创建数据目录
RUN mkdir -p /home/data

# 暴露端口
EXPOSE 3000

# 设置挂载点
VOLUME ["/home/data/database.sqlite", "/home/.env"]

# 启动命令
CMD ["yarn", "start"]