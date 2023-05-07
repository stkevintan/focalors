#!/usr/bin/env bash

set +e

GreenBG="\\033[42;37m"
YellowBG="\\033[43;37m"
BlueBG="\\033[44;37m"
Font="\\033[0m"

WORK_DIR="/app/focalors"

if [[ ! -d "$FOCALORS_IMAGE_CACHE_DIR" ]]; then
    mkdir $FOCALORS_IMAGE_CACHE_DIR
fi

echo -e "\n ================ \n ${Info} ${GreenBG} 拉取 Focalors 更新 ${Font} \n ================ \n"
if [ $(git rev-parse HEAD) = $(git ls-remote $(git rev-parse --abbrev-ref @{u} | sed 's/\// /g') | cut -f1) ]; then
    if [[ -z $(git status -s) ]]; then
        git reset --hard HEAD
    fi
    git pull origin master --allow-unrelated-histories
    set -e
    echo -e "\n ================ \n ${Info} ${GreenBG} 更新 Focalors 运行依赖 ${Font} \n ================ \n"
    pnpm install --frozen-lock
    pnpm run build-all
    set +e
fi

echo -e "\n ================ \n ${Info} ${GreenBG} 启动 Focalors ${Font} \n ================ \n"
echo Yunai Websocket Host: $FOCALORS_YUNZAI_HOST

pnpm start
