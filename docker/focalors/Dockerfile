FROM busybox:latest AS resource

COPY docker-entrypoint.sh /res/entrypoint.sh

RUN dos2unix /res/entrypoint.sh \
    && chmod +x /res/entrypoint.sh


FROM node:16-slim AS runtime

ARG REPO_URL=https://github.com/stkevintan/focalors
ARG REPO_BRANCH=master
ARG USE_APT_MIRROR=true
ARG USE_NPM_MIRROR=true

RUN export USE_APT_MIRROR=${USE_APT_MIRROR} \
    && export USE_NPM_MIRROR=${USE_NPM_MIRROR} \
    \
    && ((test "$USE_APT_MIRROR"x = "true"x \
    && sed -i "s/deb.debian.org/mirrors.ustc.edu.cn/g" /etc/apt/sources.list) || true) \
    && apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y git \
    \
    && git config --global --add safe.directory '*' \
    && git config --global pull.rebase false \
    && git config --global user.email "Yunzai@yunzai.bot" \
    && git config --global user.name "Yunzai" \
    \
    && _NPM_MIRROR_FLAG="" \
    && if [ "$USE_NPM_MIRROR"x = "true"x ]; then _NPM_MIRROR_FLAG="--registry=https://registry.npmmirror.com"; fi \
    && npm install pnpm@7.30.0 -g $_NPM_MIRROR_FLAG \
    \
    && rm -rf /var/cache/* \
    && rm -rf /tmp/*

FROM runtime AS prod

RUN REPO_URL=${REPO_URL} \
    && REPO_BRANCH=${REPO_BRANCH} \
    && USE_NPM_MIRROR=${USE_NPM_MIRROR} \
    && USE_APT_MIRROR=${USE_APT_MIRROR} \
    \
    && ((test "$USE_APT_MIRROR"x = "true"x \
    && sed -i "s/deb.debian.org/mirrors.ustc.edu.cn/g" /etc/apt/sources.list) || true) \
    && apt-get update \
    && apt-get install -y python \
    && _NPM_MIRROR_FLAG="" \
    && if [ "$USE_NPM_MIRROR"x = "true"x ]; then _NPM_MIRROR_FLAG="--registry=https://registry.npmmirror.com"; fi \
    && git clone --depth=1 --branch $REPO_BRANCH $REPO_URL /app/focalors \
    && cd /app/focalors \
    && pnpm install $_NPM_MIRROR_FLAG --frozen-lock

COPY --from=resource /res/entrypoint.sh /app/focalors/entrypoint.sh

WORKDIR /app/focalors

ENTRYPOINT ["/app/focalors/entrypoint.sh"]