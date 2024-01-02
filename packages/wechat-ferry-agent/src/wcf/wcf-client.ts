import assert from "assert";
import EventEmitter from "events";
import http, { Server } from "http";
import { StringDecoder } from "string_decoder";
import { inject, injectable } from "tsyringe";
import { WcfConfiguration } from "../config";
import { logger } from "../logger";
import { RawMessage, WcfMessage } from "./wcf-message";

@injectable()
export class WcfClient {
    private server: Server;
    private eventSub: EventEmitter;
    constructor(
        @inject(WcfConfiguration) private configuration: WcfConfiguration
    ) {
        this.eventSub = new EventEmitter({ captureRejections: true });
        this.eventSub.setMaxListeners(0);
        this.server = http.createServer((req, res) => {
            // no need to check path for now
            if (/*req.url === "/cb" && */ req.method === "POST") {
                // Create new string decoder
                const decoder = new StringDecoder("utf-8");
                let buffer = "";

                // On receiving data, append it to the buffer
                req.on("data", (data) => {
                    buffer += decoder.write(data);
                });

                req.on("end", () => {
                    // End the decoder
                    buffer += decoder.end();

                    // Check if the string is a valid JSON
                    try {
                        const jsonData = JSON.parse(buffer);
                        this.eventSub.emit("message", jsonData);
                        res.end();
                    } catch (error) {
                        logger.error("Handling wcf message error:", error);
                        res.writeHead(400, {
                            "Content-Type": "text/plain",
                        });
                        res.end("Request body contains invalid JSON");
                    }
                });
            }
        });
    }

    start() {
        const { port, host } = this.configuration.wcfHost;
        this.server.listen(port, host, () => {
            logger.info(
                `wcf http server is listening on http://${host}:${port}`
            );
        });
    }

    stop() {
        this.server.close(() => {
            logger.info("wcf http server stopped");
        });
    }

    on(eventName: "message", callback: (data: WcfMessage) => void) {
        const listener = (message: RawMessage) => {
            callback(new WcfMessage(message));
        }
        this.eventSub.on(eventName, listener);
        return () => this.eventSub.off(eventName, listener);
    }

    private getUrl(path: string) {
        const { port, host } = this.configuration.wcfServer;
        return `http://${host}:${port}${path}`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async request<T = any>(
        path: string,
        options?: RequestInit
    ): Promise<T> {
        const url = path.startsWith("http") ? path : this.getUrl(path);

        const headers: HeadersInit = { accept: "application/json" };
        if (options?.method === "POST") {
            headers["content-type"] = "application/json";
        }

        const res = await fetch(url, {
            headers,
            ...options,
        });
        const json = await res.json();
        if (json.status !== 0) {
            return Promise.reject(`Wcf API failed: ${json.message}`);
        }
        return json.data;
    }

    async getCurrentUser() {
        return await this.request<{ ui: UserInfo }>("/user-info").then(
            (data) => data.ui
        );
    }

    /*
         "wxid": "xxxx",
        "code": "xx",
        "remark": "",
        "name": "微信昵称",
        "country": "CN",
        "province": "Zhejiang",
        "city": "Hangzhou",
        "gender": "男"
    */
    async getFriendList(): Promise<Contact[]> {
        return await this.request("/friends").then((d) => d.friends);
    }

    async getContacts(): Promise<Contact[]> {
        return await this.request("/contacts").then((d) => d.contacts);
    }

    async getContact(wxid: string | ((c: Contact) => boolean)) {
        const contacts = await this.getContacts();
        return contacts.find(
            typeof wxid === "string" ? (c) => c.wxid === wxid : wxid
        );
    }

    async getGroups() {
        const contacts = await this.getContacts();
        return contacts.filter((c) => c.wxid.endsWith("@chatroom"));
    }

    async getGroupMembers(roomId: string) {
        const res = await this.request<{ members: Record<string, string> }>(
            `/chatroom-member?roomid=${roomId}`
        );
        return res.members;
    }

    async getGroupMember(roomId: string, userId: string) {
        const members = await this.getGroupMembers(roomId);
        const userName = members[userId];
        assert(
            userName,
            `Group member ${userId} should be inside group ${roomId}, but not: ${members}`
        );
        const friend = await this.getContact(userId);
        return {
            wxid: userId,
            name: userName,
            ...friend,
        };
    }

    async getGroupMemberAlias(roomId: string, userId: string) {
        const ret = await this.request<{ alias: string }>(
            `/alias-in-chatroom?wxid=${userId}&roomId=${roomId}`
        );
        ret.alias;
    }
    /**
     *
     * @param message
     * @param contactId userId or roomId
     * @param mentions: 'all' - at all, string[] - wxid list to be at
     */
    async sendText(message: string, to: string, mentions?: "all" | string[]) {
        const body = {
            msg: message,
            receiver: to,
            aters: "",
        };
        if (mentions === "all") {
            body.msg = `@所有人 ${body.msg}`;
            body.aters = "notify@all";
        } else if (Array.isArray(mentions)) {
            mentions = Array.from(new Set(mentions));
            const aliasList = await Promise.all(
                mentions.map(async (mention) =>
                    this.getGroupMemberAlias(to, mention)
                )
            );
            const mentionTexts = aliasList
                .map((alias) => `@${alias}`)
                .join(" ");
            body.msg = `${mentionTexts} ${body.msg}`;
            body.aters = mentions.join(",");
        }
        return await this.request<void>("/text", {
            method: "POST",
            body: JSON.stringify(body),
        });
    }
    /**
     *
     * @param img path to the image
     * @param to userId or roomId
     * @returns
     */
    async sendImage(img: string, to: string) {
        const body = {
            path: img,
            receiver: to,
        };
        return await this.request<void>("/image", {
            method: "POST",
            body: JSON.stringify(body),
        });
    }
}

export interface UserInfo {
    wxid: string;
    name: string;
    mobile: string;
    home: string;
}

export interface Contact {
    /** 微信系统id, wxid_xxxxxx - 个人, 1234898@chatroom - 群组, floatbottle - 漂流瓶*/
    wxid: string;
    /** 用户定义微信号 */
    code: string;
    remark: string;
    name: string;
    country: string;
    province: string;
    city: string;
    gender: string;
}

export interface WcfResponse<T = unknown> {
    status: number;
    message: string;
    data: T;
}
