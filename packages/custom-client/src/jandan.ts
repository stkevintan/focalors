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
import { bold } from "./utils/bold";

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
    sub_comment_count: string;
    pics: string[];
}

interface SubComment {
    id: number;
    author: string;
    content: string;
    date: string;
}

enum JandanTimerStatus {
    off,
    on,
    stopped,
}


const oo = bold('oo');
const xx = bold('xx');
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
        const matchRet = text.match(/^#\s*煎蛋\s*(top(\d+))?\s*$/);

        if (matchRet) {
            const top = Number.parseInt(matchRet[2], 10) || 1;
            const cnt = await this.sendJandan(from, top);
            if (cnt === 0) {
                this.sendText("暂无更新, 请稍候再试...", from);
            }
            return true;
        }

        if (!(await this.accessManager.check(userId, groupId))) {
            return false;
        }

        const timerKey = `client:jandan:timer`;
        const id = groupId ?? userId!;

        if (/^#\s*煎蛋开启定时转发\s*$/i.test(text)) {
            // const status = (await this.redis.hGet(timerKey, id)) ?? 0;
            // if (status === JandanTimerStatus.on) {
            //     this.sendText("已开启", from);
            //     return true;
            // }

            // await this.redis.hSet(timerKey, id, JandanTimerStatus.on);

            // if (status === JandanTimerStatus.stopped) {
            //     this.sendText("已开启", from);
            //     return true;
            // }

            // void (async () => {
            //     for (;;) {
            //         await this.sendJandan(from);
            //         await new Promise((r) =>
            //             setTimeout(r, 1000 * 60 * 60 * 60)
            //         );
            //         const currentStatus = await this.redis.hGet(timerKey, id);
            //         if (JandanTimerStatus.stopped === currentStatus) {
            //             await this.redis.hDel(timerKey, id);
            //         }
            //         if (JandanTimerStatus.on !== currentStatus) {
            //             break;
            //         }
            //     }
            // })();
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

    private async sendJandan(from: MessageTarget2, top = 1) {
        const commentUrl = `https://i.jandan.net/?oxwlxojflwblxbsapi=jandan.get_pic_comments`;
        let cnt = 0;
        try {
            const resp: { comments: Comment[] } = await fetch(commentUrl, {
                headers,
            }).then((r) => r.json());
            const { userId, groupId } = expandTarget(from);
            const key = this.key(groupId ?? userId!);
            for (const comment of resp.comments) {
                if (await this.redis.sIn(key, comment.comment_ID)) {
                    continue;
                }

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

                const tucao = await this.getSubComments(comment);
                this.sendText(
                    [
                        `${comment.text_content?.trim()} 作者: ${
                            comment.comment_author
                        }`,
                        `${oo}: ${comment.vote_positive}, ${xx}: ${comment.vote_negative}`,
                        tucao,
                    ]
                        .join("\n")
                        .trim(),
                    from
                );
                cnt++;
                await this.redis.sAdd(key, comment.comment_ID);
                await this.redis.expire(key, 15 * 60 * 60 * 24, "NX");
                if (cnt >= top) {
                    break;
                }
            }
        } catch (err) {
            logger.error(err);
        }
        return cnt;
    }

    private async getSubComments(comment: Comment) {
        if (+comment.sub_comment_count === 0) {
            return "";
        }
        try {
            const resp = await fetch(
                `https://api.jandan.net/api/v1/tucao/list/${comment.comment_ID}`,
                { headers }
            ).then((r) => r.json());
            const list = resp.data.list as SubComment[];
            return list
                .map((comment) => `${bold(comment.author)}: ${comment.content}`)
                .join("\n");
        } catch (err) {
            logger.error(err);
            return "";
        }
    }
}

