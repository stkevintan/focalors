#!/usr/bin/env bash

set +e

GreenBG="\\033[42;37m"
YellowBG="\\033[43;37m"
BlueBG="\\033[44;37m"
Font="\\033[0m"

Version="${BlueBG}[版本]${Font}"
Info="${GreenBG}[信息]${Font}"
Warn="${YellowBG}[提示]${Font}"

WORK_DIR="/app/Miao-Yunzai"

if [[ ! -d "$HOME/.ovo" ]]; then
    mkdir ~/.ovo
fi

function update_yunzai() {
    echo -e "\n ================ \n ${Info} ${GreenBG} 拉取 Miao-Yunzai 更新 ${Font} \n ================ \n"
    cd $WORK_DIR
    if [[ -z $(git status -s) ]]; then
        git reset --hard HEAD
        git pull --allow-unrelated-histories
    else
        git pull --allow-unrelated-histories
    fi
    if [[ ! -f "$HOME/.ovo/yunzai.ok" ]]; then
        set -e
        echo -e "\n ================ \n ${Info} ${GreenBG} 更新 Miao-Yunzai 运行依赖 ${Font} \n ================ \n"
        pnpm install -P
        touch ~/.ovo/yunzai.ok
        set +e
    fi
    echo -e "\n ================ \n ${Version} ${BlueBG} Miao-Yunzai 版本信息 ${Font} \n ================ \n"
    git log -1 --pretty=format:"%h - %an, %ar (%cd) : %s"
}

sync_plugin() {
    local repo_url=$1
    local plugin_name=$2
    local clone_if_not_exists=${3:-false}
    local plugin_root="$WORK_DIR/plugins/$plugin_name"
    if [ -d "$plugin_root/.git" ]; then
        echo -e "\n ================ \n ${Info} ${GreenBG} 拉取 ${plugin_name} 更新 ${Font} \n ================ \n"
        cd "$plugin_root"
        if [[ -n $(git status -s) ]]; then
            git reset --hard HEAD
        fi
        git pull --allow-unrelated-histories
    elif [ "$clone_if_not_exists" = "true" ]; then
        echo -e "\n ${Warn} ${YellowBG} 由于喵版云崽依赖${plugin_name}，检测到目前没有安装，开始自动下载 ${Font} \n"
        git clone --depth=1 "$repo_url" "$plugin_root"
    fi
}


update_yunzai
sync_plugin "https://gitee.com/TimeRainStarSky/Yunzai-genshin" "genshin" true
sync_plugin "https://gitee.com/yoimiya-kokomi/miao-plugin" "miao-plugin" true
sync_plugin "https://gitee.com/Ctrlcvs/xiaoyao-cvs-plugin" "xiaoyao-cvs-plugin"

set -e

cd $WORK_DIR

echo -e "\n ================ \n ${Info} ${GreenBG} 初始化 Docker 环境 ${Font} \n ================ \n"

if [ -f "./config/config/redis.yaml" ]; then
    sed -i 's/127.0.0.1/miao-redis/g' ./config/config/redis.yaml
    echo -e "\n  修改Redis地址完成~  \n"
fi

echo -e "\n ================ \n ${Info} ${GreenBG} 启动 Miao-Yunzai ${Font} \n ================ \n"

node app