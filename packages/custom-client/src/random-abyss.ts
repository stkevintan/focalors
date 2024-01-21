import {
    CardMessageSegment,
    expandTarget,
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
        @inject(OnebotWechatToken) wechat: OnebotWechat
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

        if (/^#\s*随机深渊杯满星撒销\s*$/.test(text)) {
            await this.manageCandidate("del", groupId, userId!);
            await this.sendStatus(groupId, from);
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
        const tmpl = [
            `第四届随机深渊杯目前满星: ${members.join(",") || "<暂无人满星>"}`,
            `活动时间: 1月19日周五12:00 - 1月21日周日23:59角色列表:`,
            `1 : ['荒泷一斗', '丽莎', '七七', '夜兰']`,
            `2 : ['凯亚', '枫原万叶', '迪卢克', '莱依拉']`,
            `3 : ['珊瑚宫心海', '柯莱', '白术', '珐露珊']`,
            `4 : ['安柏', '夏沃蕾', '米卡', '提纳里']`,
            `5 : ['流浪者', '妮露', '迪奥娜', '瑶瑶']`,
            `请勿在杯赛结束前分享满星完整阵容以及具体分数`,
            `具体规则请见公众号，开始挑战前请发送“开始挑战”到公众号成绩方为有效 (统计人数用)`,
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
