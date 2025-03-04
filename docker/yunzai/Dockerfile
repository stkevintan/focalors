FROM node:20-alpine3.20 

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

ARG REPO_URL=https://gitee.com/TimeRainStarSky/Yunzai.git
ARG REPO_BRANCH=main

RUN sed -i 's#https\?://dl-cdn.alpinelinux.org/alpine#https://mirrors.tuna.tsinghua.edu.cn/alpine#g' /etc/apk/repositories && \ 
    apk add --no-cache curl git font-wqy-zenhei chromium && \
    fc-cache -f -v && \
    git config --global --add safe.directory '*' && \
    git config --global pull.rebase false && \
    git config --global user.email "Yunzai@yunzai.bot" && \
    git config --global user.name "Yunzai" && \
    git clone --depth=1 --branch $REPO_BRANCH $REPO_URL /app/Miao-Yunzai && \
    npm config set -g registry https://registry.npmmirror.com && \
    npm install pnpm@10.5.0 -g && \
    cd /app/Miao-Yunzai && \
    pnpm install -P && \
    rm -rf /var/cache/* && \
    rm -rf /tmp/*

WORKDIR /app/Miao-Yunzai
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
