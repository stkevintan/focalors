import { createLogger } from "@focalors/logger";
import {
    AccessManager,
    expandTarget,
    injectAccessManager,
    MessageSegment,
    MessageTarget2,
    OnebotClient,
    OnebotWechat,
    OnebotWechatToken,
    RedisClient,
    TextMessageSegment,
} from "@focalors/onebot-protocol";
import { inject, injectable } from "tsyringe";

const logger = createLogger("jandan-client");

const headers = {
    "User-Agent": `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0`,
    Origin: `https://jandan.net`,
};

interface Comment {
    comment_ID: number;
    comment_author: string;
    comment_date: string;
    vote_positive: number;
    vote_negative: number;
    text_content: string;
    pics: string[];
}

enum JandanTimerStatus {
    off,
    on,
    stopped,
}

@injectable()
export class JanDanClient extends OnebotClient {
    constructor(
        @inject(RedisClient) protected redis: RedisClient,
        @inject(OnebotWechatToken) wechat: OnebotWechat,
        @injectAccessManager("jandan") protected accessManager: AccessManager
    ) {
        super(wechat);
    }

    private key(id: string) {
        return `client:jandan:index:${id}`;
    }

    async recv(
        message: MessageSegment[],
        from: MessageTarget2
    ): Promise<boolean> {
        const text = message.find(
            (m): m is TextMessageSegment => m.type === "text"
        )?.data.text;

        if (!text) {
            return false;
        }

        const { groupId, userId } = expandTarget(from);
        const out = await this.accessManager.manage(message, userId);
        if (out) {
            this.sendText(out, from);
            return true;
        }

        if (/^#\s*煎蛋\s*$/.test(text)) {
            await this.sendJandan(from);
            return true;
        }

        if (!(await this.accessManager.check(userId, groupId))) {
            return false;
        }

        const timerKey = `client:jandan:timer`;
        const id = groupId ?? userId!;

        if (/^#\s*煎蛋开启定时转发\s*$/i.test(text)) {
            const status = (await this.redis.hGet(timerKey, id)) ?? 0;
            if (status === JandanTimerStatus.on) {
                this.sendText("已开启", from);
                return true;
            }

            await this.redis.hSet(timerKey, id, JandanTimerStatus.on);

            if (status === JandanTimerStatus.stopped) {
                this.sendText("已开启", from);
                return true;
            }

            void (async () => {
                for (;;) {
                    await this.sendJandan(from);
                    await new Promise((r) =>
                        setTimeout(r, 1000 * 60 * 60 * 60)
                    );
                    const currentStatus = await this.redis.hGet(timerKey, id);
                    if (JandanTimerStatus.stopped === currentStatus) {
                        await this.redis.hDel(timerKey, id);
                    }
                    if (JandanTimerStatus.on !== currentStatus) {
                        break;
                    }
                }
            })();
            return true;
        }

        if (/^#\s*煎蛋关闭定时转发\s*$/i.test(text)) {
            await this.redis.hSet(timerKey, id, JandanTimerStatus.stopped);
            this.sendText("已关闭", from);
            return true;
        }

        if (/^#\s*煎蛋重置\s*$/i.test(text)) {
            await this.redis.del(this.key(id));
            await this.redis.hDel(timerKey, id);
            this.sendText("煎蛋状态已重置", from);
            return true;
        }
        return false;
    }

    private async sendJandan(from: MessageTarget2) {
        const commentUrl = `https://i.jandan.net/?oxwlxojflwblxbsapi=jandan.get_pic_comments`;
        try {
            const resp: { comments: Comment[] } = await fetch(commentUrl, {
                headers,
            }).then((r) => r.json());
            const { userId, groupId } = expandTarget(from);
            const key = this.key(groupId ?? userId!);
            const value = await this.redis.get<string>(key);

            const lastSentTime = value
                ? new Date(value).getTime()
                : new Date().getTime() - 5 * 60 * 60 * 1000;

            let sentTime = lastSentTime;
            let cnt = 0;
            for (const comment of resp.comments) {
                const commentTime = new Date(comment.comment_date).getTime();
                if (commentTime <= lastSentTime) {
                    break;
                }
                cnt++;
                for (const pic of comment.pics) {
                    await this.sendFile(
                        {
                            url: pic,
                            type: "url",
                            name: pic.replace(/.*\//, ""),
                        },
                        from,
                        pic.endsWith(".gif") ? "wx.emoji" : "image"
                    );
                }
                this.sendText(
                    `${comment.text_content} 作者: ${comment.comment_author}\noo: ${comment.vote_positive}, xx: ${comment.vote_negative}`.trim(),
                    from
                );
                sentTime = Math.max(sentTime, commentTime);
            }

            if (sentTime > lastSentTime) await this.redis.set(key, sentTime);
            if (cnt === 0) {
                this.sendText("暂无更新, 请稍候再试...", from);
            }
        } catch (err) {
            logger.error(err);
            this.sendText("糟糕，煎蛋获取失败", from);
        }
    }
}
