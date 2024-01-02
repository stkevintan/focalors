/* eslint-disable @typescript-eslint/no-explicit-any */
import { XMLParser } from "fast-xml-parser";

/*
"0": "朋友圈消息",
"1": "文字",
"3": "图片",
"34": "语音",
"37": "好友确认",
"40": "POSSIBLEFRIEND_MSG",
"42": "名片",
"43": "视频",
"47": "石头剪刀布 | 表情图片",
"48": "位置",
"49": "共享实时位置、文件、转账、链接",
"50": "VOIPMSG",
"51": "微信初始化",
"52": "VOIPNOTIFY",
"53": "VOIPINVITE",
"62": "小视频",
"66": "微信红包",
"9999": "SYSNOTICE",
"10000": "红包、系统消息",
"10002": "撤回消息",
"1048625": "搜狗表情",
"16777265": "链接",
"436207665": "微信红包",
"536936497": "红包封面",
"754974769": "视频号视频",
"771751985": "视频号名片",
"822083633": "引用消息",
"922746929": "拍一拍",
"973078577": "视频号直播",
"974127153": "商品链接",
"975175729": "视频号直播",
"1040187441": "音乐链接",
"1090519089": "文件"
*/
export enum MessageType {
    Moment = 0,
    Text = 1,
    Image = 3,
    Voice = 34,
    FriendConfirm = 37,
    Card = 42,
    Video = 43,
    Sticker = 47,
    Reply = 49,
    // POSSIBLEFRIEND_MSG = 40,
    // VOIPMSG = 50,
    // Initial = 51,
    // VOIPNOTIFY = 52,
    // VOIPINVITE = 53,
    // ShortVideo = 62,
    // RedPacket = 66,
    // SYSNOTICE = 9999,
    SYSMSG = 10000, // 拍一拍 消息
    Revoke = 1002,
    // SougouSticker = 1048625,
    // Link = 16777265,
    // RedPacket3 = 436207665,
    // RedPacketCover = 536936497,
    // ReplyMsg = 822083633,
    // Tickle = 922746929,
    File = 1090519089,
}

export interface RawMessage {
    id: number;
    /** timestamp */
    ts: number;
    sign: string;
    type: MessageType;
    xml: string;
    sender: string;
    roomid: string;
    content: string;
    thumb: string;
    extra: string;
    is_at: boolean;
    is_self: boolean;
    is_group: boolean;
}

const xmlPattern = /^<(msg|msgsource)>/;
const xmlParser: XMLParser = new XMLParser({
    ignoreAttributes: true,
    tagValueProcessor: (tagName, tagValue) => {
        tagValue = stripXMLVer(tagValue);
        if (xmlPattern.test(tagValue)) {
            return xmlParser.parse(tagValue);
        }
        return tagValue;
    },
});
export class WcfMessage {
    constructor(private readonly message: RawMessage) {}

    private _contentCache = undefined;

    get raw() {
        return this.message;
    }

    get id() {
        return this.message.id;
    }

    get type() {
        return this.message.type;
    }

    get isSelf() {
        return this.message.is_self;
    }

    get isAt() {
        return this.message.is_at;
    }

    get isGroup() {
        return this.message.is_group;
    }

    get roomId() {
        return this.message.roomid;
    }

    get content(): string | Record<string, any> {
        if (this._contentCache) {
            return this._contentCache;
        }
        return (this._contentCache =
            this.type === MessageType.Text
                ? xmlParser.parse(stripXMLVer(this.message.content as string))
                : // impossible
                  this.message.content);
    }

    get text() {
        return typeof this.content === "string"
            ? this.content
            : this.content["msg"]["appmsg"]?.["title"];
    }

    get referContent() {
        if (typeof this.content === "string") return undefined;
        return this.content["msg"]["appmsg"]?.["refermsg"];
    }

    get sender() {
        return this.message.sender;
    }
}

function stripXMLVer<T>(content: T) {
    if (typeof content === "string") {
        return content.replace(/^<\?xml version="1.0"\?>/, "");
    }
    return content;
}
