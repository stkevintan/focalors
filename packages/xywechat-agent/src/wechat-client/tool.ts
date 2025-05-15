import * as fs from "fs";
import * as path from "path";
import { inject, injectable } from "tsyringe";
import { mkdirp } from "../utils";
import { NetProxy, WechatClientBase } from "./base";
import { UserLoggedOut } from "./errors";
import { Dict } from "./types";

@injectable()
export class Tool {
    constructor(@inject(WechatClientBase) private client: WechatClientBase) {}

    /**
     * CDN下载高清图片。
     * @param aesKey 图片的AES密钥
     * @param cdnMidImgUrl 图片的CDN URL
     * @returns 图片的base64编码字符串
     * @throws UserLoggedOut: 未登录时调用
     */
    async downloadImage(aesKey: string, cdnMidImgUrl: string): Promise<string> {
        if (!this.client.wxid) {
            throw new UserLoggedOut("请先登录");
        }

        const jsonParam = {
            Wxid: this.client.wxid,
            AesKey: aesKey,
            Cdnmidimgurl: cdnMidImgUrl,
        };
        return await this.client.send("CdnDownloadImg", jsonParam);
    }

    /**
     * 下载语音文件。
     * @param msgId 消息的msgid
     * @param voiceUrl 语音的url，从xml获取
     * @param length 语音长度，从xml获取
     * @returns 语音的base64编码字符串
     * @throws UserLoggedOut: 未登录时调用
     */
    async downloadVoice(
        msgId: string,
        voiceUrl: string,
        length: number
    ): Promise<string> {
        if (!this.client.wxid) {
            throw new UserLoggedOut("请先登录");
        }

        const jsonParam = {
            Wxid: this.client.wxid,
            MsgId: msgId,
            Voiceurl: voiceUrl,
            Length: length,
        };
        const data = await this.client.send("DownloadVoice", jsonParam);
        return data.data.buffer;
    }

    async downloadAttach(attachId: string): Promise<Dict> {
        /**
         * 下载附件。
         * @param attachId 附件ID
         * @returns 附件数据
         * @throws UserLoggedOut: 未登录时调用
         */
        if (!this.client.wxid) {
            throw new UserLoggedOut("请先登录");
        }

        const jsonParam = { Wxid: this.client.wxid, AttachId: attachId };
        const data = await this.client.send("DownloadAttach", jsonParam);
        return data.data.buffer;
    }

    /**
     * 下载视频。
     * @param msgId 消息的msgid
     * @returns 视频的base64编码字符串
     * @throws UserLoggedOut: 未登录时调用
     */
    async downloadVideo(msgId: string): Promise<string> {
        if (!this.client.wxid) {
            throw new UserLoggedOut("请先登录");
        }

        const jsonParam = { Wxid: this.client.wxid, MsgId: msgId };
        const data = await this.client.send("DownloadVideo", jsonParam);
        return data.data.buffer;
    }

    /**
     * 设置步数。
     * @param count 要设置的步数
     * @returns 成功返回True，失败返回False
     * @throws UserLoggedOut: 未登录时调用
     */
    async setStep(count: number): Promise<boolean> {
        if (!this.client.wxid) {
            throw new UserLoggedOut("请先登录");
        }

        const jsonParam = { Wxid: this.client.wxid, StepCount: count };
        await this.client.send("SetStep", jsonParam);
        return true;
    }

    /**
     * 设置代理。
     * @param proxy 代理配置对象
     * @returns 成功返回True，失败返回False
     * @throws UserLoggedOut: 未登录时调用
     */
    async setProxy(proxy: NetProxy): Promise<boolean> {
        if (!this.client.wxid) {
            throw new UserLoggedOut("请先登录");
        }

        const jsonParam = {
            Wxid: this.client.wxid,
            Proxy: {
                ProxyIp: `${proxy.ip}:${proxy.port}`,
                ProxyUser: proxy.username,
                ProxyPassword: proxy.password,
            },
        };
        await this.client.send("SetProxy", jsonParam);
        return true;
    }

    /**
     * 检查数据库状态。
     * @returns 数据库正常返回True，否则返回False
     */
    async checkDatabase(): Promise<boolean> {
        const data = await this.client.send("CheckDatabaseOK", {});
        return !!data.Running;
    }

    /**
     * 将base64字符串转换为文件并保存。
     * @param base64Str base64编码的字符串
     * @param fileName 要保存的文件名
     * @param filePath 文件保存路径
     * @returns 转换成功返回True，失败返回False
     */
    static base64ToFile(
        base64Str: string,
        fileName: string,
        filePath: string
    ): boolean {
        try {
            // Ensure the directory exists
            mkdirp(filePath);

            // Prepare the full file path
            const fullPath = path.join(filePath, fileName);

            // Remove Base64 header if it exists
            base64Str = base64Str.replace(/^[^,]*,/, "");
            // Decode Base64 and write to file
            const binaryData = Buffer.from(base64Str, "base64");
            fs.writeFileSync(fullPath, binaryData);

            return true;
        } catch (error) {
            console.error("Error saving file:", error);
            return false;
        }
    }

    /**
     * 将文件转换为base64字符串。
     * @param filePath 文件路径
     * @returns base64编码的字符串
     */
    static fileToBase64(filePath: string): string {
        try {
            // Read the file and convert it to Base64
            const fileData = fs.readFileSync(filePath);
            return fileData.toString("base64");
        } catch (error) {
            console.error("Error reading file:", error);
            throw error;
        }
    }

    static base64ToByte(base64Str: string): Buffer {
        /**
         * 将base64字符串转换为bytes。
         * @param base64Str base64编码的字符串
         * @returns 解码后的字节数据
         */
        // Remove Base64 header if it exists
        base64Str = base64Str.replace(/^[^,]*,/, "");
        return Buffer.from(base64Str, "base64");
    }

    static byteToBase64(byte: Buffer): string {
        /**
         * 将bytes转换为base64字符串。
         * @param byte 字节数据
         * @returns base64编码的字符串
         */
        return byte.toString("base64");
    }

    /**
     * 将silk字节转换为wav字节。
     * @param silkByte silk格式的字节数据
     * @returns wav格式的字节数据
     */
    static async silkByteToWavByte(silkByte: Buffer): Promise<Buffer> {
        throw new Error("Unimplemented");
    }

    /**
     * 将WAV字节数据转换为AMR格式。
     * @param wavByte WAV格式的字节数据
     * @returns AMR格式的字节数据
     */
    static wavByteToAmrByte(wavByte: Buffer): Buffer {
        throw new Error("Unimplemented");
    }

    /**
     * 将WAV字节数据转换为AMR格式的base64字符串。
     * @param wavByte WAV格式的字节数据
     * @returns AMR格式的base64编码字符串
     */
    static wavByteToAmrBase64(wavByte: Buffer): Buffer {
        throw new Error("Unimplemented");
    }

    /**
     * 将WAV字节数据转换为silk格式。
     * @param wavByte WAV格式的字节数据
     * @returns silk格式的字节数据
     */
    static async wavByteToSilkByte(wavByte: Buffer): Promise<Buffer> {
        throw new Error("Unimplemented");
    }

    /**
     * 将WAV字节数据转换为silk格式的base64字符串。
     * @param wavByte WAV格式的字节数据
     * @returns silk格式的base64编码字符串
     */
    static async wavByteToSilkBase64(wavByte: Buffer): Promise<string> {
        return (await Tool.wavByteToSilkByte(wavByte)).toString("base64");
    }

    /**
     * 将silk格式的base64字符串转换为WAV字节数据。
     * @param silkBase64 silk格式的base64编码字符串
     * @returns WAV格式的字节数据
     */
    static async silkBase64ToWavByte(silkBase64: string): Promise<Buffer> {
        return Tool.silkByteToWavByte(Buffer.from(silkBase64, "base64"));
    }
}
