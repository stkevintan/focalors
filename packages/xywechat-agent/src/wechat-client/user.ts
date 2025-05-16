import { inject, injectable } from "tsyringe";
import { WechatClientBase } from "./base";

@injectable()
export class User {
    constructor(@inject(WechatClientBase) private client: WechatClientBase) {}

    /**
     * Get user profile.
     * @param wxid - User wxid (optional)
     * @returns - User profile as a dictionary
     * @throws - Error if not logged in
     */
    async getProfile(wxid?: string): Promise<{
        wxid: string;
        nickname: string;
        alias: string;
        phone: string;
    }> {
        if (!this.client.wxid && !wxid) {
            throw new Error("请先登录"); // UserLoggedOut equivalent
        }

        if (!wxid) {
            wxid = this.client.wxid;
        }

        const jsonParam = { Wxid: wxid };
        const data = await this.client.send("GetProfile", jsonParam);
        return data.userInfo;
    }

    /**
     * Get personal QR code.
     * @param style - QR code style (optional, default is 0)
     * @returns - Base64-encoded QR code string
     * @throws - Error if not logged in or under protection
     */
    async getMyQRCode(style: number = 0): Promise<string> {
        if (!this.client.wxid) {
            throw new Error("请先登录"); // UserLoggedOut equivalent
        }

        // Ignoring the `not self.ignore_protect and protector.check(14400)` branch as requested

        const jsonParam = { Wxid: this.client.wxid, Style: style };
        const data = await this.client.send("GetMyQRCode", jsonParam);
        return data.qrcode.buffer;
    }

    /**
     * Check if the user is logged in.
     * @param wxid - User wxid (optional)
     * @returns - True if logged in, False otherwise
     */
    async isLoggedIn(wxid?: string): Promise<boolean> {
        if (!wxid) {
            wxid = this.client.wxid;
        }
        if (!wxid) {
            return false;
        }

        try {
            await this.getProfile(wxid);
            return true;
        } catch {
            return false;
        }
    }
}
