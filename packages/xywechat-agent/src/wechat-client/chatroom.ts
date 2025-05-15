import { WechatClientBase } from "./base";
import { UserLoggedOut } from "./errors";
import { inject, injectable } from "tsyringe";

@injectable()
export class Chatroom {
    constructor(@inject(WechatClientBase) private client: WechatClientBase) {}

    async addChatroomMember(chatroom: string, wxid: string): Promise<boolean> {
        if (!this.client.wxid) {
            throw new UserLoggedOut("请先登录");
        }

        const jsonParam = {
            Wxid: this.client.wxid,
            Chatroom: chatroom,
            InviteWxids: wxid,
        };
        await this.client.send(`AddChatroomMember`, jsonParam);
        return true;
    }

    async getChatroomAnnounce(chatroom: string): Promise<Record<string, any>> {
        if (!this.client.wxid) {
            throw new UserLoggedOut("请先登录");
        }

        const jsonParam = { Wxid: this.client.wxid, Chatroom: chatroom };
        const json = await this.client.send(`GetChatroomInfo`, jsonParam);
        return json;
    }

    async getChatroomInfo(chatroom: string): Promise<Record<string, any>> {
        if (!this.client.wxid) {
            throw new UserLoggedOut("请先登录");
        }

        const jsonParam = { Wxid: this.client.wxid, Chatroom: chatroom };
        const json = await this.client.send(
            `GetChatroomInfoNoAnnounce`,
            jsonParam
        );
        return json.ContactList[0];
    }

    async getChatroomMemberList(
        chatroom: string
    ): Promise<Record<string, any>[]> {
        if (!this.client.wxid) {
            throw new UserLoggedOut("请先登录");
        }

        const jsonParam = { Wxid: this.client.wxid, Chatroom: chatroom };
        const json = await this.client.send(
            "GetChatroomMemberDetail",
            jsonParam
        );
        return json.NewChatroomData.ChatRoomMember;
    }

    async getChatroomQRCode(
        chatroom: string
    ): Promise<{ base64: string; description: string }> {
        if (!this.client.wxid) {
            throw new UserLoggedOut("请先登录");
        }

        const jsonParam = { Wxid: this.client.wxid, Chatroom: chatroom };
        const json = await this.client.send("GetChatroomQRCode", jsonParam);
        return {
            base64: json.qrcode.buffer,
            description: json.revokeQrcodeWording,
        };
    }

    async inviteChatroomMember(
        wxid: string | string[],
        chatroom: string
    ): Promise<boolean> {
        if (!this.client.wxid) {
            throw new UserLoggedOut("请先登录");
        }

        if (Array.isArray(wxid)) {
            wxid = wxid.join(",");
        }

        const jsonParam = {
            Wxid: this.client.wxid,
            Chatroom: chatroom,
            InviteWxids: wxid,
        };
        await this.client.send("InviteChatroomMember", jsonParam);
        return true;
    }
}
