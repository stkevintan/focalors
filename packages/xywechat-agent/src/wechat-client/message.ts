import fs from "fs";
import path from "path";
import { inject, injectable } from "tsyringe";
import { WechatClientBase } from "./base";
import { Queue } from "../utils";

type MessageResponse = [number, number, number];
type ImageResponse = [string, number, number];
type EmojiResponse = Array<Record<string, any>>;

@injectable()
export class Message {
    private messageQueue = new Queue<{
        func: (...args: any[]) => Promise<any>;
        args: any[];
        future: { resolve: (value: any) => void; reject: (error: any) => void };
    }>();
    private isProcessing = false;

    constructor(@inject(WechatClientBase) private client: WechatClientBase) {}

    private async processMessageQueue(): Promise<void> {
        if (this.isProcessing) return;

        this.isProcessing = true;
        while (!this.messageQueue.isEmpty()) {
            const { func, args, future } = this.messageQueue.dequeue();
            try {
                const result = await func(...args);
                future.resolve(result);
            } catch (error) {
                future.reject(error);
            }
        }
        this.isProcessing = false;
    }

    private async queueMessage<T>(
        func: (...args: any[]) => Promise<T>,
        ...args: any[]
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.messageQueue.enqueue({
                func,
                args,
                future: { resolve, reject },
            });
            if (!this.isProcessing) {
                this.processMessageQueue();
            }
        });
    }

    async sendTextMessage(
        wxid: string,
        content: string,
        at: string | string[] = ""
    ): Promise<MessageResponse> {
        return await this.queueMessage(
            this.sendTextMessageInternal.bind(this),
            wxid,
            content,
            at
        );
    }

    private async sendTextMessageInternal(
        wxid: string,
        content: string,
        at: string | string[] = ""
    ): Promise<MessageResponse> {
        const atStr = Array.isArray(at) ? at.join(",") : at;
        const jsonParam = {
            Wxid: this.client.wxid,
            ToWxid: wxid,
            Content: content,
            Type: 1,
            At: atStr,
        };
        const json = await this.client.send("SendTextMsg", jsonParam);
        const data = json.List[0];
        return [data.ClientMsgid, data.Createtime, data.NewMsgId];
    }

    // TODO: implement filepath
    async sendImageMessage(
        wxid: string,
        image: string | Buffer
    ): Promise<ImageResponse> {
        return await this.queueMessage(
            this.sendImageMessageInternal.bind(this),
            wxid,
            image
        );
    }

    private async sendImageMessageInternal(
        wxid: string,
        image: string | Buffer
    ): Promise<ImageResponse> {
        const base64Image =
            typeof image === "string" ? image : image.toString("base64");
        const jsonParam = {
            Wxid: this.client.wxid,
            ToWxid: wxid,
            Base64: base64Image,
        };
        const data = await this.client.send("SendImageMsg", jsonParam);
        return [data.ClientImgId.string, data.CreateTime, data.Newmsgid];
    }

    async sendVideoMessage(
        wxid: string,
        video: string | Buffer | { path: string },
        image?: string | Buffer | { path: string }
    ): Promise<[number, number]> {
        return this.queueMessage(
            this.sendVideoMessageInternal.bind(this),
            wxid,
            video,
            image
        );
    }

    private async sendVideoMessageInternal(
        wxid: string,
        video: string | Buffer | { path: string },
        image?: string | Buffer | { path: string }
    ): Promise<[number, number]> {
        if (!this.client.wxid) {
            throw new Error("User is not logged in.");
        }

        const base64Video = await this.convertToBase64(video);
        const base64Image = image
            ? await this.convertToBase64(image)
            : await this.getFallbackImageBase64();

        const jsonParam = {
            Wxid: this.client.wxid,
            ToWxid: wxid,
            Base64: base64Video,
            ImageBase64: base64Image,
        };

        const data = await this.client.send("SendVideoMsg", jsonParam);
        return [data.ClientMsgId, data.NewMsgId];
    }

    // async sendVoiceMessage(
    //     wxid: string,
    //     voice: string | Buffer | { path: string },
    //     format: "amr" | "wav" | "mp3" = "amr"
    // ): Promise<[number, number, number]> {
    //     return this.queueMessage(
    //         this.sendVoiceMessageInternal.bind(this),
    //         wxid,
    //         voice,
    //         format
    //     );
    // }

    // private async sendVoiceMessageInternal(
    //     wxid: string,
    //     voice: string | Buffer | { path: string },
    //     format: "amr" | "wav" | "mp3"
    // ): Promise<[number, number, number]> {
    //     if (!this.client.wxid) {
    //         throw new Error("User is not logged in.");
    //     }

    //     const base64Voice = await this.convertToBase64(voice);
    //     const duration = await this.getAudioDuration(base64Voice, format);

    //     const jsonParam = {
    //         Wxid: this.client.wxid,
    //         ToWxid: wxid,
    //         Base64: base64Voice,
    //         VoiceTime: duration,
    //         Type: this.getVoiceType(format),
    //     };

    //     const data = await this.client.send("SendVoiceMsg", jsonParam);
    //     return [data.ClientMsgId, data.CreateTime, data.NewMsgId];
    // }

    private async convertToBase64(
        input: string | Buffer | { path: string }
    ): Promise<string> {
        if (typeof input === "string") {
            return input; // Assume it's already a base64 string
        } else if (Buffer.isBuffer(input)) {
            return input.toString("base64");
        } else if (typeof input === "object" && "path" in input) {
            const fileBuffer = await fs.promises.readFile(input.path);
            return fileBuffer.toString("base64");
        } else {
            throw new Error(
                "Invalid input format. Must be string, Buffer, or path."
            );
        }
    }

    private async getFallbackImageBase64(): Promise<string> {
        const fallbackPath = path.resolve(__dirname, "fallback.png"); // Adjust the path accordingly
        const fileBuffer = await fs.promises.readFile(fallbackPath);
        return fileBuffer.toString("base64");
    }

    // private async getAudioDuration(
    //     base64Audio: string,
    //     format: "amr" | "wav" | "mp3"
    // ): Promise<number> {
    //     const { AudioSegment } = await import("pydub");
    //     const buffer = Buffer.from(base64Audio, "base64");
    //     const audio = AudioSegment.fromFile(buffer, format);
    //     return audio.durationSeconds * 1000; // Convert to milliseconds
    // }

    // private getVoiceType(format: "amr" | "wav" | "mp3"): number {
    //     const formatMap = {
    //         amr: 0,
    //         wav: 4,
    //         mp3: 4,
    //     };
    //     return formatMap[format];
    // }

    async sendEmojiMessage(
        wxid: string,
        md5: string,
        totalLength: number
    ): Promise<EmojiResponse> {
        return await this.queueMessage(
            this.sendEmojiMessageInternal.bind(this),
            wxid,
            md5,
            totalLength
        );
    }

    private async sendEmojiMessageInternal(
        wxid: string,
        md5: string,
        totalLength: number
    ): Promise<EmojiResponse> {
        const jsonParam = {
            Wxid: this.client.wxid,
            ToWxid: wxid,
            Md5: md5,
            TotalLen: totalLength,
        };
        const data = await this.client.send("SendEmojiMsg", jsonParam);
        return data.emojiItem;
    }

    async sendAppMessage(
        wxid: string,
        xml: string,
        type: number
    ): Promise<MessageResponse> {
        return await this.queueMessage(
            this.sendAppMessageInternal.bind(this),
            wxid,
            xml,
            type
        );
    }

    private async sendAppMessageInternal(
        wxid: string,
        xml: string,
        type: number
    ): Promise<MessageResponse> {
        const jsonParam = {
            Wxid: this.client.wxid,
            ToWxid: wxid,
            Xml: xml,
            Type: type,
        };
        const data = await this.client.send("SendAppMsg", jsonParam);
        return [data.clientMsgId, data.createTime, data.newMsgId];
    }

    async sendLinkMessage(
        wxid: string,
        url: string,
        title: string = "",
        description: string = "",
        thumbUrl: string = ""
    ): Promise<[string, number, number]> {
        return this.queueMessage(
            this.sendLinkMessageInternal.bind(this),
            wxid,
            url,
            title,
            description,
            thumbUrl
        );
    }

    private async sendLinkMessageInternal(
        wxid: string,
        url: string,
        title: string = "",
        description: string = "",
        thumbUrl: string = ""
    ): Promise<[string, number, number]> {
        if (!this.client.wxid) {
            throw new Error("User is not logged in.");
        }

        const jsonParam = {
            Wxid: this.client.wxid,
            ToWxid: wxid,
            Url: url,
            Title: title,
            Desc: description,
            ThumbUrl: thumbUrl,
        };

        const data = await this.client.send("SendShareLink", jsonParam);
        return [data.ClientMsgid, data.CreateTime, data.NewMsgId];
    }

    async sendCardMessage(
        wxid: string,
        cardWxid: string,
        cardNickname: string,
        cardAlias: string = ""
    ): Promise<[number, number, number]> {
        return this.queueMessage(
            this.sendCardMessageInternal.bind(this),
            wxid,
            cardWxid,
            cardNickname,
            cardAlias
        );
    }

    private async sendCardMessageInternal(
        wxid: string,
        cardWxid: string,
        cardNickname: string,
        cardAlias: string = ""
    ): Promise<[number, number, number]> {
        if (!this.client.wxid) {
            throw new Error("User is not logged in.");
        }

        const jsonParam = {
            Wxid: this.client.wxid,
            ToWxid: wxid,
            CardWxid: cardWxid,
            CardAlias: cardAlias,
            CardNickname: cardNickname,
        };

        const json = await this.client.send("SendCardMsg", jsonParam);
        const data = json.List[0];
        return [data.ClientMsgid, data.Createtime, data.NewMsgId];
    }

    async syncMessage(): Promise<any> {
        if (!this.client.wxid) {
            throw new Error("User is not logged in.");
        }

        const jsonParam = {
            Wxid: this.client.wxid,
            Scene: 0,
            Synckey: "",
        };

        return await this.client.send("Sync", jsonParam);
    }
}
