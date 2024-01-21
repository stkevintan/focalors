import { inject, singleton } from "tsyringe";
import { MessageType, WcfMessage } from "./wcf-message";
import { logger } from "./logger";
import { WcfConfiguration } from "./config";
import assert from "assert";
import {
    FriendInfo,
    GroupInfo,
    MentionMessageSegment,
    MessageSegment,
    MessageTarget2,
    OnebotWechat,
    RedisClient,
    UploadFileAction,
} from "@focalors/onebot-protocol";
import { Contact, UserInfo, Wcferry, FileRef } from "@wcferry/core";
import { WcfWSServer } from "@wcferry/ws";
import { randomUUID } from "crypto";
import os from "os";
import path from "path";
import { ensureDirSync } from "@wcferry/core/src/lib/utils";

export interface Contact2 extends Contact {
    avatar?: string;
}

@singleton()
export class WechatFerry implements OnebotWechat {
    private bot: Wcferry;
    private server?: WcfWSServer;

    constructor(
        @inject(WcfConfiguration) protected configuration: WcfConfiguration,
        @inject(RedisClient) protected redis: RedisClient
    ) {
        this.bot = new Wcferry(this.configuration.wcf);
    }

    private currentUser?: UserInfo;

    get self() {
        assert(
            this.currentUser,
            "Current user isnot available, has wechat ferry started?"
        );
        return {
            id: this.currentUser.wxid,
            name: this.currentUser.name,
        };
    }

    async start(): Promise<void> {
        this.bot.start();
        this.server = new WcfWSServer(this.bot, {
            port: 8000,
        });
        ensureDirSync(this.dlCache);
        this.currentUser = this.bot.getUserInfo();
        logger.info("wechat-ferry started");
    }
    private stopped = false;

    async stop(): Promise<void> {
        if (!this.stopped) {
            this.server?.close();
            this.bot.stop();
            this.stopped = true;
        }
    }

    subscribe(
        callback: (message: MessageSegment[], from: MessageTarget2) => void
    ) {
        return this.bot.on(async (wxmsg) => {
            const message = new WcfMessage(wxmsg);
            logger.info(
                `Received Message: ${message.id} [From ${message.sender}]`,
                `[Type:${message.typeName}]`,
                message.isGroup ? `[Group]` : ""
            );
            logger.debug(`Content:`, message.content);
            const msgSegments: MessageSegment[] = [];
            if (message.isSelf) {
                logger.warn(`Self message, skip...`);
            }

            if (message.isAt(this.self.id)) {
                msgSegments.push({
                    type: "mention",
                    data: { user_id: this.self.id },
                });
            }

            // if (message.type === MessageType.Image) {
            //     logger.info("Insert message id:", message.id);
            //     const p = await this.bot.downloadAttach(message.id, message.raw.thumb, message.extra);
            //     await this.bot.decryptImage(message.extra, 'abdfgh');
            //     console.log('# path:', p);
            // }

            switch (message.type) {
                case MessageType.Reply: {
                    /*
                    refermsg: {
                        type: 1,
                        svrid: 'xxxxxxxxxxxx',
                        fromusr: 'xxxxxxxx@chatroom' or 'wxid_xxxxxxxx',
                        chatusr: 'wxid_xxxxxxx',
                        displayname: '< nick name >',
                        content: '< text >'
                    }
                    */
                    const refer = message.content.msg?.appmsg?.refermsg;
                    msgSegments.push(
                        {
                            type: "reply",
                            data: {
                                user_id: refer?.chatusr,
                                message_id: refer?.svrid,
                                message_content: refer?.content,
                                message_type:
                                    refer?.type === MessageType.Image
                                        ? "image"
                                        : refer?.type === MessageType.Text
                                        ? "text"
                                        : "others",
                            },
                        },
                        {
                            type: "text",
                            data: { text: message.text ?? "" },
                        }
                    );
                    break;
                }
                case MessageType.Text:
                    msgSegments.push({
                        type: "text",
                        data: { text: message.text ?? "" },
                    });
                    break;
            }

            callback(
                msgSegments,
                message.isGroup
                    ? { groupId: message.roomId, userId: message.sender }
                    : message.sender
            );
        });
    }

    queryAvatar(condition = `wxid LIKE "wxid_%"`) {
        const sql = `SELECT usrName as wxid, smallHeadImgUrl, bigHeadImgUrl FROM ContactHeadImgUrl WHERE ${condition};`;
        const ret = this.bot.dbSqlQuery("MicroMsg.db", sql) as Array<{
            wxid: string;
            smallHeadImgUrl: string;
            bigHeadImgUrl: string;
        }>;
        return ret.map((r) => ({
            wxid: r.wxid,
            avatar: r.bigHeadImgUrl || r.smallHeadImgUrl || "",
        }));
    }

    enhanceContactsWithAvatars(contacts: Contact[]): Contact2[] {
        if (!contacts.length) {
            return [];
        }
        const wxids = contacts.map((c) => `"${c.wxid}"`).join(",");
        const heads = this.queryAvatar(`wxid IN (${wxids})`);
        const headMap = Object.fromEntries(
            heads.map((h) => [h.wxid, h] as const)
        );
        return contacts.map<Contact2>((c) => {
            const head = headMap[c.wxid];
            return {
                ...c,
                avatar: head?.avatar ?? "",
            };
        });
    }

    async getFriends(withAvatar = true): Promise<FriendInfo[]> {
        const friends = this.bot.getFriends();
        const contacts = withAvatar
            ? this.enhanceContactsWithAvatars(friends)
            : friends;
        return contacts.map((c) => ({
            user_id: c.wxid!,
            user_name: c.name!,
            user_displayname: c.name ?? "",
            user_remark: c.remark,
            "wx.avatar": (c as Contact2).avatar ?? "",
        }));
    }

    async getGroups(withAvatar = true): Promise<GroupInfo[]> {
        const groups = this.bot.getChatRooms();
        const contacts = withAvatar
            ? this.enhanceContactsWithAvatars(groups)
            : groups;
        return contacts.map((g) => ({
            group_id: g.wxid!,
            group_name: g.name!,
            "wx.avatar": (g as Contact2).avatar,
        }));
    }

    async getGroupMember(roomId: string, userId: string) {
        const members = await this.bot.getChatRoomMembers(roomId);
        const userName = members[userId];
        assert(
            userName,
            `Group member ${userId} should be inside group ${roomId}, but not: ${members}`
        );
        const friend = this.bot.getContact(userId);
        return {
            ...friend,
            wxid: friend?.wxid || userId,
            name: friend?.name || userName,
        };
    }

    async getGroupMembers(roomId: string) {
        return await this.bot.getChatRoomMembers(roomId);
    }

    async getFriend(
        userId: string,
        groupId?: string,
        withAvatar = true
    ): Promise<FriendInfo> {
        const user = groupId
            ? this.bot.getContact(userId) ??
              (await this.getGroupMember(groupId, userId))
            : this.bot.getContact(userId);
        assert(
            user,
            `Cannot find contact: ${userId} ${
                groupId ? `group: ${groupId}` : ""
            }`
        );

        const [avatar] = withAvatar
            ? this.queryAvatar(`wxid = "${userId}"`)
            : [{ avatar: "" }];
        return {
            user_id: user.wxid,
            user_name: user.name,
            user_displayname: "",
            user_remark: user.remark,
            "wx.avatar": avatar?.avatar,
        };
    }

    sendTxt(
        msg: string,
        receiver: string,
        mentions?: "all" | string[]
    ): number {
        const body = {
            msg,
            receiver,
            aters: "",
        };
        if (mentions === "all") {
            body.msg = `@所有人 ${body.msg}`;
            body.aters = "notify@all";
        } else if (Array.isArray(mentions)) {
            mentions = Array.from(new Set(mentions));
            const aliasList = mentions.map((mention) =>
                this.bot.getAliasInChatRoom(receiver, mention)
            );
            const mentionTexts = aliasList
                .map((alias) => `@${alias}`)
                .join(" ");
            body.msg = `${mentionTexts} ${body.msg}`;
            body.aters = mentions.join(",");
        }
        return this.bot.sendTxt(body.msg, body.receiver, body.aters);
    }

    async uploadFile(file: UploadFileAction["req"]): Promise<string> {
        const id = file.name ?? randomUUID();
        const key = createRedisFileKey(id);
        if (await this.redis.exists(key)) {
            await this.redis.expire(key, 20 * 60);
            return id;
        }

        await this.redis.set(key, file, {
            EX: 20 * 60,
        });

        return id;
    }

    private async fetchCachedFile(id: string): Promise<FileRef | undefined> {
        const key = createRedisFileKey(id);
        const payload = await this.redis.get<UploadFileAction["req"]>(key);
        if (!payload) {
            return undefined;
        }
        switch (payload.type) {
            case "url":
                return new FileRef(payload.url, {
                    headers: payload.headers,
                    name: payload.name,
                });
            case "data":
                return new FileRef(Buffer.from(payload.data, "base64"), {
                    name: payload.name,
                });
            case "path":
                return new FileRef(payload.path, { name: payload.name });
            default:
                logger.warn("Cannot upload file:", payload);
                return undefined;
        }
    }

    async downloadImage(msgid: string): Promise<string> {
        return await this.bot.downloadImage(msgid, this.dlCache);
    }

    private readonly dlCache = path.join(os.tmpdir(), ".wcferry-downloads");

    async send(
        messages: MessageSegment[],
        to: string | { groupId: string; userId?: string }
    ) {
        const { groupId, userId } =
            typeof to === "string" ? { userId: to, groupId: undefined } : to;

        const mentions = groupId
            ? await Promise.all(
                  messages
                      .filter(
                          (m): m is MentionMessageSegment =>
                              m.type === "mention"
                      )
                      .map((m) => m.data.user_id)
              )
            : [];
        try {
            for (const message of messages) {
                switch (message.type) {
                    case "reply":
                        if (groupId) {
                            mentions.push(message.data.user_id);
                        }
                        // repliedMessage = await this.bot.Message.find({
                        //     id: message.data.message_id,
                        //     fromId: message.data.user_id,
                        //     roomId: group.id,
                        // });
                        break;
                    // merge adjacent text message?
                    case "text":
                        this.sendTxt(
                            message.data.text,
                            groupId ?? userId!,
                            mentions
                        );
                        // repliedMessage = undefined;
                        break;
                    case "image":
                    case "wx.emoji": {
                        const ref = await this.fetchCachedFile(
                            message.data.file_id
                        );
                        if (ref) {
                            // unable to reply with an image in wechat
                            this.bot.sendImage(ref, groupId ?? userId!);
                        } else {
                            this.bot.sendTxt("[图片]", groupId ?? userId!);
                        }
                        break;
                    }
                    case "file": {
                        const ref = await this.fetchCachedFile(
                            message.data.file_id
                        );
                        if (ref) {
                            // unable to reply with an image in wechat
                            this.bot.sendFile(ref, groupId ?? userId!);
                        } else {
                            this.bot.sendTxt("[文件]", groupId ?? userId!);
                        }
                        break;
                    }
                    case "card":
                        this.bot.sendRichText(message.data, groupId ?? userId!);
                        break;

                    // case "wx.xml":
                    //     this.bot.sendXML(message.data, groupId ?? userId);
                }
            }
            return true;
        } catch (err) {
            logger.error(err);
            return false;
        }
    }
}

function createRedisFileKey(id: string) {
    return `wechat:cache:file:${id}`;
}
