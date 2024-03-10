import {
    AccessManager,
    CardMessageSegment,
    expandTarget,
    injectAccessManager,
    MessageSegment,
    MessageTarget2,
    OnebotClient,
    OnebotWechat,
    OnebotWechatToken,
    RedisClient,
    ReplyMessageSegment,
    TextMessageSegment,
} from "@focalors/onebot-protocol";
import { inject, injectable } from "tsyringe";

const ghCard: CardMessageSegment = {
    type: "card",
    data: {
        name: "",
        digest: "",
        title: "Random Abyss",
        account: "gh_cabafdd5cf81",
        thumburl: `http://mmbiz.qpic.cn/sz_mmbiz_png/nMeboN2UZ1ghzh1zzpN3xrYDUiaENePuH9JiaoBLVJhTfYkBh4Z9icBNVYfqS7ylaBEBhJX22nwLZ5yGL0dSDOFxQ/0?wx_fmt=png`,
        // eslint-disable-next-line no-useless-escape
        // url: `https://mp.weixin.qq.com/mp/getmasssendmsg?__biz=MzkyMjYyMzY1MA==#wechat_webview_type=1&wechat_redirect","title_key":"__mp_wording__brandinfo_history_massmsg"`
        url: `https://mp.weixin.qq.com/mp/getmasssendmsg?__biz=MzkyMjYyMzY1MA==#wechat_webview_type=1&wechat_redirect`,
    },
};
@injectable()
export class RandomAbyssClient extends OnebotClient {
    constructor(
        @inject(RedisClient) protected redis: RedisClient,
        @inject(OnebotWechatToken) wechat: OnebotWechat,
        @injectAccessManager("abyss") protected accessManager: AccessManager
    ) {
        super(wechat);
    }
    private key(groupId: string) {
        return `client:random-abyss:${groupId}`;
    }
    private tplKey = `client:random-abyss-template`;
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

        if (groupId) {
            if (/^#\s*随机深渊杯\s*$/.test(text)) {
                await this.sendStatus(groupId, from);
                return true;
            }

            if (/^#\s*随机深渊杯满星\s*$/.test(text)) {
                await this.manageCandidate("add", groupId, userId!);
                await this.sendStatus(groupId, from);
                return true;
            }

            if (/^#\s*随机深渊杯(满星)?撤销\s*$/.test(text)) {
                await this.manageCandidate("del", groupId, userId!);
                await this.sendStatus(groupId, from);
                return true;
            }

            if (/^#\s*随机深渊杯清空\s*$/.test(text)) {
                await this.redis.del(this.key(groupId));
                this.sendText("已清空", from);
                return true;
            }
        }

        if (!(await this.accessManager.check(userId, groupId))) {
            return false;
        }

        if (/^#\s*随机深渊杯设置\s*$/.test(text)) {
            const reply = message.find(
                (m): m is ReplyMessageSegment => m.type === "reply"
            )?.data;
            if (!reply) {
                this.sendText("请回复模板消息", from);
                return true;
            }
            if (reply.message_type !== "text" || !reply.message_content) {
                this.sendText("请回复文字消息", from);
                return true;
            }
            const template = `${reply.message_content}`;
            await this.redis.set(this.tplKey, template);
            this.sendText("设置成功", from);
            if (groupId) {
                this.sendStatus(groupId, from);
            }
            return true;
        }

        return false;
    }

    async manageCandidate(op: "add" | "del", groupId: string, userId: string) {
        await this.redis[op === "add" ? "sAdd" : "sRem"](
            this.key(groupId),
            userId
        );
    }

    private async sendStatus(groupId: string, from: MessageTarget2) {
        const members = await this.getCandidates(groupId);
        const outcome = members.length
            ? `满星${members.length}名: ${members.join(",")}`
            : `暂无人满星`;
        const tmpl =
            (await this.redis.get<string>(this.tplKey)) ??
            `随机深渊杯,目前{candidates}`;
        const text = tmpl.replace(/{\s*candidates\s*}/, outcome);
        this.send([{ type: "text", data: { text } }, ghCard], from);
    }

    private async getCandidates(groupId: string) {
        const key = this.key(groupId);
        const ids = await this.redis.sEntries(key);
        const memberDict = await this.wechat.getGroupMembers(groupId);
        const users = [...ids].map((id) => memberDict[id] ?? id);
        return users;
    }
}
