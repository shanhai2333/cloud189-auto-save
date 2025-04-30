# 使用Node.js v16.19.0作为基础镜像
FROM node:16.19.0-slim

# 设置工作目录
WORKDIR /home

# 复制源码
COPY . .

# 设置时区
ENV TZ=Asia/Shanghai
RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone
    
# 安装必要的依赖项
RUN apt-get update && \
    apt-get install -y ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# 安装cloud189-sdk依赖
RUN cd vender/cloud189-sdk && \
    yarn install && \
    yarn build

# 安装依赖
RUN yarn install && \
    yarn build

# 移除vender/cloud189-sdk的源代码
RUN rm -rf vender/cloud189-sdk

# 创建数据目录
RUN mkdir -p /home/data

# 创建STRM目录
RUN mkdir -p /home/strm

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["yarn", "start"]