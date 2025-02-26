FROM node:16-slim AS runtime

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

ARG REPO_URL=https://gitee.com/TimeRainStarSky/Yunzai.git
ARG REPO_BRANCH=main

RUN sed -i "s/deb.debian.org/mirrors.ustc.edu.cn/g" /etc/apt/sources.list &&
    apt-get update &&
    apt-get upgrade -y &&
    apt-get install -y wget xz-utils curl gnupg git fonts-wqy-microhei xfonts-utils chromium fontconfig libxss1 libgl1 &&
    apt-get autoremove &&
    apt-get clean &&
    fc-cache -f -v &&
    git config --global --add safe.directory '*' &&
    git config --global pull.rebase false &&
    git config --global user.email "Yunzai@yunzai.bot" &&
    git config --global user.name "Yunzai" &&
    git clone --depth=1 --branch $REPO_BRANCH $REPO_URL /app/Miao-Yunzai &&
    _NPM_MIRROR_FLAG="--registry=https://registry.npmmirror.com" &&
    npm install pnpm@7.30.0 -g $_NPM_MIRROR_FLAG &&
    rm -rf /var/cache/* &&
    rm -rf /tmp/*

WORKDIR /app/Miao-Yunzai
ENTRYPOINT ["/entrypoint.sh"]
