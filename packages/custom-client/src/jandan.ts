import { createLogger } from "@focalors/logger";
import {
    AccessManager,
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
import { bold } from "@focalors/logger";

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

// const oo = bold("oo");
// const xx = bold("xx");
// const FROM = bold("from");
@injectable()
export class JanDanClient extends OnebotClient {
    constructor(
        @inject(RedisClient) protected redis: RedisClient,
        @inject(OnebotWechatToken) wechat: OnebotWechat,
        @injectAccessManager("jandan") protected accessManager: AccessManager
    ) {
        super(wechat);
    }

    private timerKey = `client:jandan:timer:groups`;

    private key(id: string) {
        return `client:jandan:index:${id}`;
    }

    private intervalHandler = new Map<string, NodeJS.Timer>();

    override async start() {
        await this.initTimer();
    }

    private async initTimer() {
        const ids = await this.redis.sEntries(this.timerKey);
        logger.debug(`init timer for groups: ${Array.from(ids).join(", ")}`);
        for (const id of ids) {
            this.switchTimer(id, true);
        }
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

        const { groupId, userId } = from;
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

        const id = groupId ?? userId!;

        if (groupId) {
            if (/^#\s*煎蛋定时转发\s*开启\s*$/i.test(text)) {
                await this.redis.sAdd(this.timerKey, groupId);
                this.switchTimer(groupId, true);
                this.sendText(`已开启`, new MessageTarget2({ groupId }));
                return true;
            }

            if (/^#\s*煎蛋定时转发\s*关闭\s*$/i.test(text)) {
                await this.redis.sRem(this.timerKey, groupId);
                this.switchTimer(groupId, false);
                this.sendText("已关闭", new MessageTarget2({ groupId }));
                return true;
            }
        }

        if (/^#\s*煎蛋重置\s*$/i.test(text)) {
            await this.redis.del(this.key(id));
            await this.redis.del(this.timerKey);
            this.sendText("煎蛋状态已重置", from);
            return true;
        }
        return false;
    }

    private switchTimer(groupId: string, on: boolean) {
        const handler = this.intervalHandler.get(groupId);
        if (on) {
            if (handler) {
                clearInterval(handler);
            }
            logger.info(`start timer for group ${groupId}`);
            this.intervalHandler.set(
                groupId,
                setInterval(async () => {
                    // only actiate in daytime
                    const currentHour = new Date().getHours();
                    if (currentHour >= 9 && currentHour < 23) {
                        await this.sendJandan(new MessageTarget2({ groupId }));
                    }
                }, 30 * 60 * 1000)
            );
        } else {
            if (handler) {
                clearInterval(handler);
                this.intervalHandler.delete(groupId);
            }
        }
    }

    private async sendJandan(
        from: MessageTarget2,
        top = 1,
        page = 0
    ): Promise<number> {
        let commentUrl = `https://i.jandan.net/?oxwlxojflwblxbsapi=jandan.get_pic_comments`;
        if (page) {
            commentUrl += `&page=${page}`;
        }

        let cnt = 0;
        try {
            const resp: {
                comments: Comment[];
                current_page: number;
                page_count: number;
            } = await fetch(commentUrl, {
                headers,
            }).then((r) => r.json());
            const { userId, groupId } = from;
            const key = this.key(groupId ?? userId!);
            for (const comment of resp.comments) {
                logger.info(`processing comment ${comment.comment_ID}`);
                if (
                    undefined !=
                    (await this.redis.zRank(key, comment.comment_ID))
                ) {
                    logger.info(`comment ${comment.comment_ID} is visited`);
                    continue;
                }

                for (const pic of comment.pics) {
                    const [url, name] = useCDN(pic);
                    logger.info(`sending pic ${url}`);
                    await this.sendFile(
                        {
                            url,
                            type: "url",
                            name,
                        },
                        from,
                        url.endsWith(".gif") ? "wx.emoji" : "image"
                    );
                }

                // const tucao = await this.getSubComments(comment);
                // this.sendText(
                //     [
                //         `${comment.text_content?.trim()}`,
                //         `${oo}: ${comment.vote_positive}, ${xx}: ${comment.vote_negative}, ${FROM}: ${comment.comment_author}`,
                //         tucao,
                //     ]
                //         .join("\n")
                //         .trim(),
                //     from
                // );
                cnt++;
                const timestamp = new Date(comment.comment_date).getTime();
                await this.redis.zAdd(key, comment.comment_ID, timestamp);
                if (comment.comment_ID % 5 === 0) {
                    await this.rmOutdated(key);
                }

                if (cnt >= top) {
                    break;
                }
            }

            if (cnt < top && resp.current_page < resp.page_count) {
                return await this.sendJandan(
                    from,
                    top - cnt,
                    resp.current_page + 1
                );
            }
        } catch (err) {
            logger.error(err);
        }
        return cnt;
    }

    private async rmOutdated(key: string) {
        logger.info(`clean up outdated comments 15 days ago`);
        await this.redis.zRemRangeByScore(
            key,
            "-inf",
            Date.now() - 15 * 24 * 60 * 60 * 1000
        );
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

/**
 * replace sina cdn url with toto.im cdn url since sina cdn is blocked for public access
 * @param url original sina cdn url
 * @returns
 */
function useCDN(url: string): [url: string, name: string] {
    // https://wx1.sinaimg.cn/mw600/008HL3Tkly1hxuygj36inj30vd18xnb2.jpg
    // https://img.toto.im/large/88c184bcly1hxuzp0kjeag20b40684qs.gif
    const file = url.replace(/.*\//, "");
    return [`https://img.toto.im/large/${file}`, file];
}
