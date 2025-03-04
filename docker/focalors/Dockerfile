FROM node:20

ARG REPO_URL=https://github.com/stkevintan/focalors
ARG REPO_BRANCH=master
RUN sed -i 's#https\?://deb.debian.org#https://mirrors.tuna.tsinghua.edu.cn/debian#g' /etc/apt/sources.list.d/debian.sources && \
    apt install git && \
    git config --global --add safe.directory '*' && \
    git config --global pull.rebase false && \
    git config --global user.email "Yunzai@yunzai.bot" && \
    git config --global user.name "Yunzai" && \
    git clone --depth=1 --branch $REPO_BRANCH $REPO_URL /app/focalors && \
    npm config set -g registry https://registry.npmmirror.com && \
    npm install pnpm@10.5.0 -g && \
    cd /app/focalors && \
    pnpm install && \ 
    rm -rf /var/cache/* && \
    rm -rf /tmp/*

WORKDIR /app/focalors

ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
