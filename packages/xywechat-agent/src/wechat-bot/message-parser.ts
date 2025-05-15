import { createLogger } from "@focalors/logger";
import assert from "assert";
import { inject } from "tsyringe";
import { parseXml } from "../utils/xml";
import { Tool } from "../wechat-client/tool";
import { Dict } from "../wechat-client/types";
import { MessageDB } from "./message-db";

export enum MessageType {
    Text = 1,
    Image = 3,
    Voice = 34,
    FriendRequest = 37,
    Video = 43,
    XML = 49,
    INIT = 51,
    System = 10002,
}

// Interfaces for different types of messages
export interface BaseMessage<T = string> {
    MsgId: string;
    MsgType: MessageType;
    FromWxid: string;
    ToWxid: string;
    SenderWxid: string;
    IsGroup: boolean;
    Content: T;
    /** XML source */
    MsgSource: string;
    raw: RawMessage;
}

type RawMessage = {
    MsgType: MessageType;
    MsgId: string;
    FromUserName: { string: string };
    ToWxid: { string: string };
    Content: { string: string };
    /** XML source */
    MsgSource: string;
    [key: string]: any;
};

export interface TextMessage extends BaseMessage {
    MsgType: MessageType.Text;
    Ats: string[];
}

export interface ImageMessage extends BaseMessage<"[图片]" | Buffer> {
    MsgType: MessageType.Image;
}

export interface VoiceMessage extends BaseMessage<"[语音]" | Buffer> {
    MsgType: MessageType.Voice;
}

export interface VideoMessage extends BaseMessage<"[视频]" | Buffer> {
    MsgType: MessageType.Video;
}

export interface XMLMessage extends BaseMessage {
    MsgType: MessageType.XML;
    SubType?: "Quote" | "File";
}

export interface XMLQuoteMessage extends XMLMessage {
    SubType: "Quote";
    Quote: Quote;
}

export interface XMLFileMessage extends XMLMessage {
    SubType: "File";
    Filename: string;
    FileExtend: string;
    AttachId: string;
    File?: any;
}

export interface Quote {
    MsgType: MessageType;
    NewMsgId: string;
    ToWxid: string;
    FromWxid: string;
    Nickname: string;
    MsgSource: string;
    Content: string;
    Createtime: string;
    appmsg: Dict;
}

// export interface XMLQuote {
//     MsgType: MessageType.XML;
//     NewMsgId: string;
//     ToWxid: string;
//     FromWxid: string;
//     Nickname: string;
//     MsgSource: string;
//     CreateTime: string;
//     Content: string;
//     destination: string;
//     action: string;
//     XmlType: number;
//     showtype: number;
//     soundtype: number;
//     url: string;
//     lowurl: string;
//     dataurl: string;
//     lowdataurl: string;
//     songlyric: string;
//     appattach: any;
//     extinfo: string;
//     sourceusername: string;
//     sourcedisplayname: string;
//     thumburl: string;
//     md5: string;
//     statextstr: string;
//     directshare: number;
// }

export interface SystemMessage extends BaseMessage {
    MsgType: MessageType.System;
    SubType: string;
}

export interface SystemPatMessage extends SystemMessage {
    SubType: "pat";
    Patter: string;
    Patted: string;
    PatSuffix: string;
}

export interface FriendRequestMessage extends BaseMessage {
    MsgType: MessageType.FriendRequest;
}

export interface InitMessage extends BaseMessage {
    MsgType: MessageType.INIT;
}

export type Message =
    | TextMessage
    | ImageMessage
    | VoiceMessage
    | VideoMessage
    | XMLMessage
    | SystemMessage
    | FriendRequestMessage
    | InitMessage;

const logger = createLogger("BotMessage");

export class MessageParser {
    private _wxid: string | null = null;

    get wxid(): string {
        if (!this._wxid) {
            throw new Error("Wechat ID not set");
        }
        return this._wxid;
    }

    constructor(
        @inject(MessageDB) private messageDB: MessageDB,
        @inject(Tool) private tool: Tool
    ) {}

    updateProfile(wxid: string): void {
        this._wxid = wxid;
    }

    private normMessage(raw: RawMessage): BaseMessage {
        const message: BaseMessage = {
            FromWxid: raw.FromUserName.string,
            ToWxid: raw.ToWxid.string,
            MsgId: raw.MsgId,
            MsgType: raw.MsgType,
            MsgSource: raw.MsgSource,
            Content: raw.Content.string?.trim() ?? "",
            // default values
            SenderWxid: "",
            IsGroup: false,
            raw,
        };
        // Handle messages sent by the bot to a group chat
        if (
            message.FromWxid === this._wxid &&
            message.ToWxid?.endsWith("@chatroom")
        ) {
            // 由于是自己发送的消息，所以对于自己来说，From和To是反的
            [message.FromWxid, message.ToWxid] = [
                message.ToWxid,
                message.FromWxid,
            ];
        }
        message.IsGroup = message.FromWxid.endsWith("@chatroom");
        if (message.IsGroup) {
            const splited = message.Content.split(":", 1);
            /*
                split_content = message["Content"].split(":\n", 1)
            if len(split_content) > 1:
                message["Content"] = split_content[1]
                message["SenderWxid"] = split_content[0]
            else:  # 绝对是自己发的消息! qwq
                message["Content"] = split_content[0]
                message["SenderWxid"] = self.wxid
                */
            if (splited.length > 1) {
                message.Content = splited[1].trim();
                message.SenderWxid = splited[0];
            } else {
                // 绝对是自己发的消息! qwq
                message.SenderWxid = this.wxid;
            }
        } else {
            message.SenderWxid = message.FromWxid;
            // 自己发的消息
            if (message.FromWxid === this.wxid) {
                message.FromWxid = message.ToWxid;
            }
        }
        return message;
    }

    async processMessage(raw: RawMessage): Promise<Message | null> {
        const message = this.normMessage(raw);
        // Trigger different events based on message type
        switch (message.MsgType) {
            case MessageType.Text: // Text message
                return await this.processTextMessage(message);
            case MessageType.Image: // Image message
                return await this.processImageMessage(message);
            case MessageType.Voice: // Voice message
                return await this.processVoiceMessage(message);
            case MessageType.Video: // Video message
                return await this.processVideoMessage(message);
            case MessageType.XML: // XML message
                return await this.processXMLMessage(message);
            case MessageType.System: // System message
                return await this.processSystemMessage(message);
            case MessageType.FriendRequest: // Friend request
                return message as FriendRequestMessage;
            case MessageType.INIT:
                return message as InitMessage;
            default:
                logger.info("Unknown message type: {}", message);
                return null;
        }
    }

    private async processTextMessage(base: BaseMessage): Promise<TextMessage> {
        const message: TextMessage = {
            ...base,
            MsgType: MessageType.Text,
            Ats: this.parseAt(base.MsgSource),
        };
        // save into db
        /*
             await self.msg_db.save_message(
            msg_id=int(message["MsgId"]),
            sender_wxid=message["SenderWxid"],
            from_wxid=message["FromWxid"],
            msg_type=int(message["MsgType"]),
            content=message["Content"],
            is_group=message["IsGroup"]
        )
        */
        await this.messageDB.save({
            MsgId: message.MsgId,
            SenderWxid: message.SenderWxid,
            FromWxid: message.FromWxid,
            MsgType: message.MsgType,
            Content: message.Content,
            IsGroup: message.IsGroup,
        });

        logger.info(
            `收到文本消息: 消息ID:%s 来自:%s 发送人:%s @:%s 内容:%s`,
            message.MsgId,
            message.FromWxid,
            message.SenderWxid,
            message.Ats.join(","),
            message.Content
        );
        return message;
    }

    private parseAt(msgSource: string): string[] {
        try {
            const ats: string =
                parseXml(msgSource).find("atuserlist").text() ?? "";
            return ats.split(",").filter((at) => at !== "");
        } catch (error) {
            logger.error(`Error parsing at users: %O`, error);
            return [];
        }
    }

    private async processImageMessage(
        base: BaseMessage
    ): Promise<ImageMessage> {
        const message: ImageMessage = {
            ...base,
            MsgType: MessageType.Image,
            Content: "[图片]",
            // Content: base.Content.replace(/\n|\t/g, ""),
        };
        const baseContent = base.Content.replace(/\n|\t/g, "");

        logger.info(
            `收到图片消息: 消息ID:%s 来自:%s 发送人:%s XML:%s`,
            message.MsgId,
            message.FromWxid,
            message.SenderWxid,
            baseContent
        );

        await this.messageDB.save({
            MsgId: message.MsgId,
            SenderWxid: message.SenderWxid,
            FromWxid: message.FromWxid,
            MsgType: message.MsgType,
            Content: message.MsgSource,
            IsGroup: message.IsGroup,
        });
        const buffer = await this.downloadImage(baseContent);
        if (buffer) {
            message.Content = buffer;
        }
        return message;
    }

    private async processVoiceMessage(
        base: BaseMessage
    ): Promise<VoiceMessage> {
        const message: VoiceMessage = {
            ...base,
            MsgType: MessageType.Voice,
            Content: "[语音]",
        };
        const baseContent = base.Content.replace(/\n|\t/g, "");

        logger.info(
            `收到语音消息: 消息ID:%s 来自:%s 发送人:%s XML:%s`,
            message.MsgId,
            message.FromWxid,
            message.SenderWxid,
            baseContent
        );
        await this.messageDB.save({
            MsgId: message.MsgId,
            SenderWxid: message.SenderWxid,
            FromWxid: message.FromWxid,
            MsgType: message.MsgType,
            Content: baseContent,
            IsGroup: message.IsGroup,
        });

        let silk: string | undefined = undefined;
        if (message.IsGroup || !message.raw["ImgBuf"]?.buffer) {
            silk = await this.downloadVoice(message.MsgId, baseContent);
        } else {
            silk = message.raw["ImgBuf"].buffer;
        }
        if (silk) {
            message.Content = await Tool.silkBase64ToWavByte(silk);
        }
        return message;
    }

    private async processVideoMessage(
        base: BaseMessage
    ): Promise<VideoMessage> {
        const message: VideoMessage = {
            ...base,
            MsgType: MessageType.Video,
            Content: "[视频]",
        };
        const baseContent = base.Content.replace(/\n|\t/g, "");

        logger.info(
            `收到视频消息: 消息ID:%s 来自:%s 发送人:%s XML:%s`,
            message.MsgId,
            message.FromWxid,
            message.SenderWxid,
            baseContent
        );
        await this.messageDB.save({
            MsgId: message.MsgId,
            SenderWxid: message.SenderWxid,
            FromWxid: message.FromWxid,
            MsgType: message.MsgType,
            Content: baseContent,
            IsGroup: message.IsGroup,
        });

        const base64 = await this.tool.downloadVideo(message.MsgId);
        message.Content = Buffer.from(base64, "base64");
        return message;
    }

    private async processXMLMessage(
        base: BaseMessage
    ): Promise<XMLMessage | null> {
        const baseContent = base.Content.replace(/\n|\t/g, "");
        const message: XMLMessage = {
            ...base,
            MsgType: MessageType.XML,
            Content: baseContent,
        };
        await this.messageDB.save({
            MsgId: message.MsgId,
            SenderWxid: message.SenderWxid,
            FromWxid: message.FromWxid,
            MsgType: message.MsgType,
            Content: baseContent,
            IsGroup: message.IsGroup,
        });
        const subType = this.findSubType(baseContent);
        switch (subType) {
            case 57: // quote
                return await this.processXMLQuoteMessage(message);
            case 6:
                return await this.processXMLFileMessage(message);
            case 74: // file is uploading, ignore
            default:
                return null;
        }
    }

    private async processXMLQuoteMessage(
        message: XMLMessage
    ): Promise<XMLQuoteMessage | null> {
        try {
            const root = parseXml(message.Content);
            const appmsg = root.find("appmsg");
            const text: string = appmsg.find("title").text() ?? "";
            const refermsg = appmsg.find("refermsg");
            const quote: Quote = {
                MsgType: +refermsg.find("type").text() as MessageType,
                NewMsgId: refermsg.find("svrid").text() ?? "",
                ToWxid: refermsg.find("fromusr").text() ?? "",
                FromWxid: refermsg.find("chatusr").text() ?? "",
                Nickname: refermsg.find("displayname").text() ?? "",
                Content: refermsg.find("content").text() ?? "",
                MsgSource: refermsg.find("msgsource").text() ?? "",
                Createtime: refermsg.find("createtime").text() ?? "",
                appmsg: appmsg.get(),
            };
            const quoteMessage: XMLQuoteMessage = {
                ...message,
                SubType: "Quote",
                Content: text,
                Quote: quote,
            };

            logger.info(
                "收到引用消息: 消息ID:%s 来自:%s 发送人:%s  内容:%s 引用:%s",
                quoteMessage.MsgId,
                quoteMessage.FromWxid,
                quoteMessage.SenderWxid,
                quoteMessage.Content,
                quoteMessage.Quote
            );
            return quoteMessage;
        } catch (error) {
            logger.error(`Error parsing quoted message: %O`, error);
        }
        return null;
    }

    private async processXMLFileMessage(
        message: XMLMessage
    ): Promise<XMLFileMessage | null> {
        const fileMessage: XMLFileMessage = {
            ...message,
            SubType: "File",
            Filename: "",
            FileExtend: "",
            AttachId: "",
        };
        try {
            const root = parseXml(message.Content);
            const appmsg = root.find("appmsg");
            fileMessage.Filename =
                appmsg.find("title").text() ?? "unknown file";
            fileMessage.AttachId =
                appmsg.find("appattach").find("attachid").text() ?? "";
            fileMessage.FileExtend =
                appmsg.find("appattach").find("fileext").text() ?? "";
            if (fileMessage.AttachId === "") {
                return null;
            }

            logger.info(
                "收到文件消息: 消息ID:%s 来自:%s 发送人:%s  XML: %s",
                fileMessage.MsgId,
                fileMessage.FromWxid,
                fileMessage.SenderWxid,
                fileMessage.Content
            );

            await this.messageDB.save({
                MsgId: fileMessage.MsgId,
                SenderWxid: fileMessage.SenderWxid,
                FromWxid: fileMessage.FromWxid,
                MsgType: fileMessage.MsgType,
                Content: fileMessage.Content,
                IsGroup: fileMessage.IsGroup,
            });

            fileMessage.File = await this.tool.downloadAttach(
                fileMessage.AttachId
            );
            return fileMessage;
        } catch (error) {
            logger.error(`Error downloading file: %O`, error);
            return null;
        }
    }

    private async processSystemMessage(
        base: BaseMessage
    ): Promise<SystemMessage | null> {
        const message: SystemMessage = {
            ...base,
            MsgType: MessageType.System,
            SubType: "",
        };

        try {
            const root = parseXml(message.Content);
            message.SubType = root.get("type") ?? "";
        } catch (error) {
            logger.error(`Error parsing system message: %O`, error);
        }
        switch (message.SubType) {
            case "pat":
                // pat pat
                return await this.processSystemPatMessage(message);
                break;
            case "ClientCheckGetExtInfo":
                return null;
            default:
                return message;
        }
        // await this.messageDB.save({
        //     MsgId: message.MsgId,
        //     SenderWxid: message.SenderWxid,
        //     FromWxid: message.FromWxid,
        //     MsgType: message.MsgType,
        //     Content: message.Content,
        //     IsGroup: message.IsGroup,
        // });

        // logger.info(
        //     `收到系统消息: 消息ID:%s 来自:%s 发送人:%s 内容:%s`,
        //     message.MsgId,
        //     message.FromWxid,
        //     message.SenderWxid,
        //     message.Content
        // );
    }

    private async processSystemPatMessage(
        message: SystemMessage
    ): Promise<SystemPatMessage | null> {
        const patMessage: SystemPatMessage = {
            ...message,
            SubType: "pat",
            Patter: "",
            Patted: "",
            PatSuffix: "",
        };
        try {
            const root = parseXml(message.Content);
            const pat = root.find("pat");
            patMessage.Patter = pat.find("fromusername").text() ?? "";
            patMessage.Patted = pat.find("pattedusername").text() ?? "";
            patMessage.PatSuffix = pat.find("patsuffix").text() ?? "";
            if (patMessage.Patter === "" || patMessage.Patted === "") {
                return null;
            }
            logger.info(
                `收到拍拍消息: 消息ID:%s 来自:%s 发送人:%s 拍者:%s 被拍: %s 后缀: %s`,
                patMessage.MsgId,
                patMessage.FromWxid,
                patMessage.SenderWxid,
                patMessage.Patter,
                patMessage.Patted,
                patMessage.PatSuffix
            );
            await this.messageDB.save({
                MsgId: patMessage.MsgId,
                SenderWxid: patMessage.SenderWxid,
                FromWxid: patMessage.FromWxid,
                MsgType: patMessage.MsgType,
                Content: `${patMessage.Patter} 拍了拍 ${patMessage.Patted} ${patMessage.PatSuffix}`,
                IsGroup: patMessage.IsGroup,
            });
            return patMessage;
        } catch (err) {
            logger.error(`Error parsing pat message: %O`, err);
            return null;
        }
    }

    private findSubType(xml: string): number {
        try {
            const root = parseXml(xml);
            const type = root.find("appmsg").find("type").text();
            if (type) {
                return +type;
            }
        } catch (error) {
            logger.error(`Error parsing sub type: %O`, error);
        }
        return -1;
    }

    private async downloadVoice(
        msgId: string,
        content: string
    ): Promise<string | undefined> {
        try {
            const root = parseXml(content);
            const voiceElement = root.find("voicemsg");
            const voiceUrl = voiceElement.get("voiceurl");
            const length = voiceElement.get("length");
            if (voiceUrl && length) {
                return await this.tool.downloadVoice(msgId, voiceUrl, length);
            }
        } catch (error) {
            logger.error(`Error parsing voice message: %O`, error);
        }
        return undefined;
    }

    private async downloadImage(content: string): Promise<Buffer | undefined> {
        try {
            const root = parseXml(content);
            const imgElement = root.find("img");
            const aesKey = imgElement.get("aeskey");
            const cdnmidimgurl = imgElement.get("cdnmidimgurl");
            const base64 = await this.tool.downloadImage(aesKey, cdnmidimgurl);
            return Buffer.from(base64, "base64");
        } catch (error) {
            logger.error(`Error parsing image key and URL: %O`, error);
        }
        return undefined;
    }
}
