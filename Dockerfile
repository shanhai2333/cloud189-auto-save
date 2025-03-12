# 使用Node.js v16.19.0作为基础镜像
FROM node:16.19.0-slim

# 设置工作目录
WORKDIR /home

# 复制package.json和yarn.lock
COPY package.json yarn.lock tsconfig.json ./

# 更换为国内镜像源
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list && \
    sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list

# 安装必要的依赖项
RUN apt-get update && \
    apt-get install -y ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# 安装依赖
RUN yarn install

# 复制源代码
COPY src ./src

# 创建数据目录
RUN mkdir -p /home/data

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["yarn", "start"]