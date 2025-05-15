import { inject, injectable } from "tsyringe";
import { WechatClientBase } from "./base";
import { Dict } from "./types";

@injectable()
export class EnvelopeService {
    constructor(@inject(WechatClientBase) private client: WechatClientBase) {}

    /**
     * Get HongBao (Red Packet) details.
     * @param xml - HongBao XML data
     * @param encryptKey - Encryption key
     * @param encryptUserinfo - Encrypted user information
     * @returns - HongBao details as a dictionary
     * @throws - Error if not logged in
     */
    async getEnvelopeDetail(
        xml: string,
        encryptKey: string,
        encryptUserinfo: string
    ): Promise<Dict> {
        if (!this.client.wxid) {
            throw new Error("请先登录"); // UserLoggedOut equivalent
        }

        const jsonParam = {
            Wxid: this.client.wxid,
            Xml: xml,
            EncryptKey: encryptKey,
            EncryptUserinfo: encryptUserinfo,
        };

        // Using the existing method to handle HTTP requests and responses
        const data = await this.client.send("GetHongBaoDetail", jsonParam);
        return data;
    }
}
