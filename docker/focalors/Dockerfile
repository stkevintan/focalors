FROM node:16-slim AS runtime

ARG REPO_URL=https://github.com/stkevintan/focalors
ARG REPO_BRANCH=master

RUN sed -i "s/deb.debian.org/mirrors.ustc.edu.cn/g" /etc/apt/sources.list &&
    apt-get update &&
    apt-get upgrade -y &&
    apt-get install -y git &&
    git config --global --add safe.directory '*' &&
    git config --global pull.rebase false &&
    git config --global user.email "Yunzai@yunzai.bot" &&
    git config --global user.name "Yunzai" &&
    git clone --depth=1 --branch $REPO_BRANCH $REPO_URL /app/focalors &&
    _NPM_MIRROR_FLAG="--registry=https://registry.npmmirror.com" &&
    npm install pnpm@7.30.0 -g $_NPM_MIRROR_FLAG &&
    rm -rf /var/cache/* &&
    rm -rf /tmp/*

WORKDIR /app/focalors

ENTRYPOINT ["/entrypoint.sh"]
