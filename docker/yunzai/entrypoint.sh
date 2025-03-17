#!/usr/bin/env sh

# Disable exit-on-error behavior
set +e

GreenBG="\033[42;37m"
YellowBG="\033[43;37m"
BlueBG="\033[44;37m"
Font="\033[0m"

Version="${BlueBG}[版本]${Font}"
Info="${GreenBG}[信息]${Font}"
Warn="${YellowBG}[提示]${Font}"

WORK_DIR="/app/Miao-Yunzai"

if [ ! -d "$HOME/.ovo" ]; then
    mkdir -p "$HOME/.ovo"
fi

update_yunzai() {
    printf "%b\n" "\n ================ \n ${Info} ${GreenBG} 拉取 Miao-Yunzai 更新 ${Font} \n ================ \n"
    cd "$WORK_DIR" || exit 1
    if [ -z "$(git status -s)" ]; then
        git reset --hard HEAD
        git pull --allow-unrelated-histories
    else
        git pull --allow-unrelated-histories
    fi
    if [ ! -f "$HOME/.ovo/yunzai.ok" ]; then
        set -e
        printf "%b\n" "\n ================ \n ${Info} ${GreenBG} 更新 Miao-Yunzai 运行依赖 ${Font} \n ================ \n"
        pnpm install -P
        touch "$HOME/.ovo/yunzai.ok"
        set +e
    fi
    printf "%b\n" "\n ================ \n ${Version} ${BlueBG} Miao-Yunzai 版本信息 ${Font} \n ================ \n"
    git log -1 --pretty=format:"%h - %an, %ar (%cd) : %s"
}

sync_plugin() {
    repo_url="$1"
    plugin_name="$2"
    # Use the default value if not provided
    if [ -z "$3" ]; then
        clone_if_not_exists="false"
    else
        clone_if_not_exists="$3"
    fi
    plugin_root="$WORK_DIR/plugins/$plugin_name"
    if [ -d "$plugin_root/.git" ]; then
        printf "%b\n" "\n ================ \n ${Info} ${GreenBG} 拉取 ${plugin_name} 更新 ${Font} \n ================ \n"
        cd "$plugin_root" || exit 1
        if [ -n "$(git status -s)" ]; then
            git reset --hard HEAD
        fi
        if ! git pull --allow-unrelated-histories; then
            printf "%b\n" "\n ${Warn} ${YellowBG} 拉取 ${plugin_name} 更新失败，删除插件目录并重新克隆 ${Font} \n"
            cd "$WORK_DIR/plugins" || exit 1
            rm -rf "$plugin_name"
            sync_plugin "$repo_url" "$plugin_name" "true"
        fi
    elif [ "$clone_if_not_exists" = "true" ]; then
        printf "%b\n" "\n ${Warn} ${YellowBG} 由于喵版云崽依赖${plugin_name}，检测到目前没有安装，开始自动下载 ${Font} \n"
        git clone --depth=1 "$repo_url" "$plugin_root"
    fi
}

update_yunzai
sync_plugin "https://gitee.com/TimeRainStarSky/Yunzai-genshin" "genshin" true
sync_plugin "https://github.com/yoimiya-kokomi/miao-plugin" "miao-plugin" true
sync_plugin "https://github.com/ctrlcvs/xiaoyao-cvs-plugin" "xiaoyao-cvs-plugin" true
pnpm i -P

set -e

cd "$WORK_DIR" || exit 1

printf "%b\n" "\n ================ \n ${Info} ${GreenBG} 初始化 Docker 环境 ${Font} \n ================ \n"

if [ -f "./config/config/redis.yaml" ]; then
    sed -i 's/127.0.0.1/miao-redis/g' ./config/config/redis.yaml
    printf "%b\n" "\n  修改Redis地址完成~  \n"
fi

printf "%b\n" "\n ================ \n ${Info} ${GreenBG} 启动 Miao-Yunzai ${Font} \n ================ \n"


node app