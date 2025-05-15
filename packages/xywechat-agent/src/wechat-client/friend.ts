import { inject, injectable } from "tsyringe";
import { WechatClientBase } from "./base";
import { Dict } from "./types";

@injectable()
export class Friend {
    constructor(@inject(WechatClientBase) private client: WechatClientBase) {}

    async acceptFriend(
        scene: number,
        v1: string,
        v2: string
    ): Promise<boolean> {
        /**
         * Accept a friend request.
         *
         * @param scene - Source, obtained from the message XML.
         * @param v1 - v1 key.
         * @param v2 - v2 key.
         * @returns True if the operation is successful.
         */
        if (!this.client.wxid) {
            throw new Error("Please log in first.");
        }

        const jsonParam = {
            Wxid: this.client.wxid,
            Scene: scene,
            V1: v1,
            V2: v2,
        };
        await this.client.send("AcceptFriend", jsonParam);
        return true;
    }

    async getContact(
        wxid: string | string[]
    ): Promise<Record<string, any> | Record<string, any>[]> {
        /**
         * Get contact information.
         *
         * @param wxid - Contact wxid. Can be a single wxid or a list of wxids.
         * @returns Contact information as a dictionary (for a single wxid) or a list of dictionaries (for multiple wxids).
         */
        if (!this.client.wxid) {
            throw new Error("Please log in first.");
        }

        const requestWxids = Array.isArray(wxid) ? wxid.join(",") : wxid;
        const jsonParam = {
            Wxid: this.client.wxid,
            RequestWxids: requestWxids,
        };
        const jsonResp = await this.client.send("GetContact", jsonParam);
        return jsonResp.ContactList.length === 1
            ? jsonResp.ContactList[0]
            : jsonResp.ContactList;
    }

    async getContractDetail(
        wxid: string | string[],
        chatroom: string = ""
    ): Promise<Dict[]> {
        /**
         * Get contact details.
         *
         * @param wxid - Contact wxid.
         * @param chatroom - Chatroom wxid.
         * @returns A list of contact details.
         */
        if (!this.client.wxid) {
            throw new Error("Please log in first.");
        }

        if (Array.isArray(wxid) && wxid.length > 20) {
            throw new Error(
                "You can query a maximum of 20 contacts at a time."
            );
        }

        const requestWxids = Array.isArray(wxid) ? wxid.join(",") : wxid;
        const jsonParam = {
            Wxid: this.client.wxid,
            RequestWxids: requestWxids,
            Chatroom: chatroom,
        };
        const jsonResp = await this.client.send("GetContractDetail", jsonParam);
        return jsonResp.ContactList;
    }

    async getContractList(
        wxSeq: number = 0,
        chatroomSeq: number = 0
    ): Promise<Dict> {
        /**
         * Get the contact list.
         *
         * @param wxSeq - Contact sequence.
         * @param chatroomSeq - Chatroom sequence.
         * @returns Contact list data.
         */
        if (!this.client.wxid) {
            throw new Error("Please log in first.");
        }

        const jsonParam = {
            Wxid: this.client.wxid,
            CurrentWxcontactSeq: wxSeq,
            CurrentChatroomContactSeq: chatroomSeq,
        };
        const jsonResp = await this.client.send("GetContractList", jsonParam);
        return jsonResp;
    }
    async getNickname(wxid: string | string[]): Promise<string | string[]> {
        /**
         * Get user nickname.
         *
         * @param wxid - User wxid. Can be a single wxid or a list of up to 20 wxids.
         * @returns A string for a single wxid or a list of strings for multiple wxids.
         */
        const data = await this.getContractDetail(wxid);

        if (typeof wxid === "string") {
            return data?.[0]?.["NickName"]?.string ?? "";
        } else {
            return data.map((contact) => {
                return contact?.["NickName"].string ?? "";
            });
        }
    }
}
