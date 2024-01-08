import { inject, singleton } from "tsyringe";
import { MessageType, WcfMessage } from "./wcf";
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
} from "@focalors/onebot-protocol";
import { WcfNativeClient } from "./wcf/wcf-native-client";
import { wcf } from "./wcf/proto-generated/wcf";

export interface Contact {
    wxid?: string;
    code?: string;
    remark?: string;
    name?: string;
    country?: string;
    province?: string;
    city?: string;
    gender?: number;
    avatar?: string;
}

@singleton()
export class WechatFerry extends OnebotWechat {
    constructor(
        @inject(WcfConfiguration)
        protected configuration: WcfConfiguration,
        @inject(WcfNativeClient) protected bot: WcfNativeClient
    ) {
        super();
    }

    private currentUser?: wcf.UserInfo;

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
        this.currentUser = this.bot.getUserInfo();
        logger.info("wechat-ferry started");
    }

    async stop(): Promise<void> {
        this.bot.stop();
    }

    override subscribe(
        callback: (message: MessageSegment[], from: MessageTarget2) => void
    ) {
        return this.bot.on((wxmsg: wcf.WxMsg) => {
            const message = new WcfMessage(wxmsg);
            logger.debug(
                `Received Message: ${message.id} [From ${message.sender}]`,
                `[Type:${message.typeName}]`,
                message.isGroup ? `[Group]` : "",
                message.xml
            );
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

            switch (message.type) {
                case MessageType.Reply:
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
                    msgSegments.push(
                        {
                            type: "reply",
                            data: {
                                user_id:
                                    message.content.msg.appmsg?.refermsg
                                        ?.chatusr,
                                message_id:
                                    message.content.msg.appmsg?.refermsg?.svrid,
                                message_content:
                                    message.content.msg?.appmsg?.refermsg
                                        ?.content,
                            },
                        },
                        {
                            type: "text",
                            data: { text: message.text ?? "" },
                        }
                    );
                    break;
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

    enhanceContactsWithAvatars(contacts: wcf.RpcContact[]): Contact[] {
        if (!contacts.length) {
            return [];
        }
        const wxids = contacts.map((c) => `"${c.wxid}"`).join(",");
        const heads = this.queryAvatar(`wxid IN (${wxids})`);
        const headMap = Object.fromEntries(
            heads.map((h) => [h.wxid, h] as const)
        );
        return contacts.map<Contact>((c) => {
            const head = headMap[c.wxid];
            return {
                ...c.toObject(),
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
            "wx.avatar": (c as Contact).avatar ?? "",
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
            "wx.avatar": (g as Contact).avatar,
        }));
    }

    getGroupMember(roomId: string, userId: string) {
        const members = this.bot.getChatRoomMembers(roomId);
        const userName = members[userId];
        assert(
            userName,
            `Group member ${userId} should be inside group ${roomId}, but not: ${members}`
        );
        const friend = this.bot.getContact(userId);
        return {
            wxid: userId,
            name: userName,
            ...friend.toObject(),
        };
    }

    async getFriend(
        userId: string,
        groupId?: string,
        withAvatar = true
    ): Promise<FriendInfo> {
        const user = groupId
            ? this.bot.getContact(userId) ??
              this.getGroupMember(groupId, userId)
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
                    this.bot.sendTxt(
                        message.data.text,
                        groupId ?? userId!,
                        mentions
                    );
                    // repliedMessage = undefined;
                    break;
                case "image":
                case "wx.emoji":
                    // unable to reply with an image in wechat
                    this.bot.sendImage(
                        // todo
                        message.data.file_id,
                        groupId ?? userId!
                    );
                    break;
                case "card":
                    this.bot.sendRichText(message.data, groupId ?? userId!);
                    break;
            }
        }
        return true;
    }
}
