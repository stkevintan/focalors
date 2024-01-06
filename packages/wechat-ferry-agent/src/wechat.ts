import { inject, singleton } from "tsyringe";
import { MessageType, UserInfo, WcfClient, WcfMessage } from "./wcf";
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

@singleton()
export class WechatFerry extends OnebotWechat {
    constructor(
        @inject(WcfClient) protected bot: WcfClient,
        @inject(WcfConfiguration)
        protected configuration: WcfConfiguration
    ) {
        super();
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
        this.currentUser = await this.bot.getCurrentUser();
        logger.info("wechat-ferry started");
    }

    async stop(): Promise<void> {
        this.bot.stop();
    }

    override subscribe(
        callback: (message: MessageSegment[], from: MessageTarget2) => void
    ) {
        return this.bot.on("message", (message: WcfMessage) => {
            logger.debug(
                `Received Message: ${message.id} [From ${message.sender}]`,
                `[Type:${message.typeName}]`,
                message.isGroup ? `[Group]` : "",
            );
            const msgSegments: MessageSegment[] = [];
            if (message.isSelf) {
                logger.warn(`Self message, skip...`);
            }

            if (message.isAt) {
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
                                message_content: message.content.msg?.appmsg?.refermsg?.content
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

    async getFriends(withAvatar = true): Promise<FriendInfo[]> {
        const friends = await this.bot.getFriendList();
        const contacts = withAvatar
            ? await this.bot.enhanceContactsWithAvatars(friends)
            : friends;
        return contacts.map((c) => ({
            user_id: c.wxid,
            user_name: c.name,
            user_displayname: c.name,
            user_remark: c.remark,
            "wx.avatar": c.avatar,
        }));
    }

    async getGroups(withAvatar = true): Promise<GroupInfo[]> {
        const groups = await this.bot.getGroups();
        const contacts = withAvatar
            ? await this.bot.enhanceContactsWithAvatars(groups)
            : groups;
        return contacts.map((g) => ({
            group_id: g.wxid,
            group_name: g.name,
            "wx.avatar": g.avatar,
        }));
    }

    async getFriend(
        userId: string,
        groupId?: string,
        withAvatar = true
    ): Promise<FriendInfo> {
        const user = groupId
            ? (await this.bot.getContact(userId)) ??
              (await this.bot.getGroupMember(groupId, userId))
            : await this.bot.getContact(userId);
        assert(
            user,
            `Cannot find contact: ${userId} ${
                groupId ? `group: ${groupId}` : ""
            }`
        );

        const [avatar] = withAvatar
            ? await this.bot.queryAvatar(`wxid = "${userId}"`)
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
                    await this.bot.sendText(
                        message.data.text,
                        groupId ?? userId!,
                        mentions
                    );
                    // repliedMessage = undefined;
                    break;
                case "image":
                case "wx.emoji":
                    // unable to reply with an image in wechat
                    await this.bot.sendImage(
                        // todo
                        message.data.file_id,
                        groupId ?? userId!
                    );
                    break;
                case "card":
                    await this.bot.sendCard(message.data, groupId ?? userId!);
                    break;
            }
        }
        return true;
    }
}
