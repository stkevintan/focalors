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
    private key = (groupId: string) => `client:random-abyss:${groupId}`;
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
        if (!groupId) {
            return false;
        }

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

        const out = await this.accessManager.manage(message, userId);
        if (out) {
            this.sendText(out, from);
            return true;
        }
        if (
            !(await this.accessManager.check(groupId || userId!))
        ) {
            return false;
        }
        if (/^#\s*随机深渊杯清空\s*$/.test(text)) {
            await this.redis.del(this.key(groupId));
            return true;
        }

        // if (/^#\s*随机深渊杯设置\s+/.test(text)) {
        //     const cnt = text.replace(/^#\s*随机深渊杯设置\s+/, '');
            
        // }


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
        const tmpl = [
            `-第五届随机深渊杯目前${outcome}`,
            `-活动时间：2月1日周四4:00 - 2月4日周日23:59`,
            `-角色属性列表：`,
            `1分: 草 风 雷 雷`,
            `2分: 水 风 冰 冰`,
            `3分: 火 草 草 冰`,
            `4分: 冰 风 岩 岩`,
            `5分: 冰 雷 火 水`,
            `-角色列表请发送任意消息到公众号获取(不限时挑战)`,
            `-具体规则请见公众号`,
            `-请勿在活动结束前分享完整阵容以及具体分数`,
        ];
        this.send(
            [{ type: "text", data: { text: tmpl.join("\n") } }, ghCard],
            from
        );
    }

    private async getCandidates(groupId: string) {
        const key = this.key(groupId);
        const ids = await this.redis.sEntries(key);
        await this.redis.expire(key, 4 * 60 * 60 * 24, "NX");
        const memberDict = await this.wechat.getGroupMembers(groupId);
        const users = [...ids].map((id) => memberDict[id] ?? id);
        return users;
    }
}
