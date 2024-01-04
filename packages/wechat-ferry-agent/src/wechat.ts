import { inject, singleton } from "tsyringe";
import { Wechat } from "@focalors/wechat-bridge";
import { Protocol, YunzaiClient } from "@focalors/yunzai-client";
import { MessageType, UserInfo, WcfClient } from "./wcf";
import { logger } from "./logger";
import { WcfConfiguration } from "./config";
import assert from "assert";

@singleton()
export class WechatFerry extends Wechat {
    constructor(
        @inject(WcfClient) protected bot: WcfClient,
        @inject(WcfConfiguration)
        protected override configuration: WcfConfiguration
    ) {
        super(configuration);
    }

    private currentUser?: UserInfo;

    override get self() {
        assert(
            this.currentUser,
            "Current user isnot available, has wechat ferry started?"
        );
        return {
            id: this.currentUser.wxid,
            name: this.currentUser.name,
        };
    }

    override async start(): Promise<void> {
        this.bot.start();
        this.currentUser = await this.bot.getCurrentUser();
        logger.info("wechat-ferry started");
    }

    override async stop(): Promise<void> {
        this.bot.stop();
    }

    override bridge(client: YunzaiClient): void {
        this.bot.on("message", (message) => {
            logger.debug(
                `Received Message: [From ${message.sender}]`,
                `[Type:${message.typeName}]`,
                message.isGroup ? `[Group]` : ""
            );
            if (
                message.type !== MessageType.Text &&
                message.type !== MessageType.Reply
            ) {
                logger.warn(
                    `Unsupported message type: ${MessageType[message.type]} (${
                        message.type
                    })`
                );
                return;
            }
            if (message.isSelf) {
                logger.warn(`Self message, skip...`);
                return;
            }

            let { text = "" } = message;
            if (!/(^\s*[#*])|_MHYUUID/.test(text)) {
                logger.warn(`Message without prefix # or *, skip...`);
                return;
            }
            if (text.startsWith('#!')) {
                text = text.substring(2);
            }
            logger.info("Message to forward:", text);

            const segment: Protocol.MessageSegment[] = [
                {
                    type: "text",
                    data: { text },
                },
            ];

            if (message.isGroup) {
                void client.forward(segment, {
                    groupId: message.roomId,
                    userId: message.sender,
                });
            } else {
                void client.forward(segment, message.sender);
            }
        });
    }

    override async getFriendList(): Promise<Protocol.FriendInfo[]> {
        const friends = await this.bot.getFriendList();
        const contacts = await this.bot.enhanceContactsWithAvatars(friends);
        return contacts.map((c) => ({
            user_id: c.wxid,
            user_name: c.name,
            user_displayname: c.name,
            user_remark: c.remark,
            "wx.avatar": c.avatar,
            "wx.verify_flag": "1",
        }));
    }

    override async getGroupList(): Promise<Protocol.GroupInfo[]> {
        const groups = await this.bot.getGroups();
        const contacts = await this.bot.enhanceContactsWithAvatars(groups);
        return contacts.map((g) => ({
            group_id: g.wxid,
            group_name: g.name,
            "wx.avatar": g.avatar,
        }));
    }

    override async getGroupMemberInfo(
        params: Protocol.ActionParam<Protocol.GetGroupMemberInfoAction>
    ): Promise<Protocol.ActionReturn<Protocol.GetGroupMemberInfoAction>> {
        const { user_id, group_id } = params;
        const user = await this.bot.getGroupMember(group_id, user_id);
        const [avatar] = await this.bot.queryAvatar(`wxid = "${user_id}"`);
        return {
            user_id: user.wxid,
            user_name: user.name,
            user_displayname: "",
            "wx.wx_number": user_id,
            "wx.province": user?.province,
            "wx.city": user?.city,
            "wx.avatar": avatar?.avatar,
        };
    }

    async send(
        messages: Protocol.MessageSegment[],
        to: string | { groupId: string; userId?: string }
    ) {
        const groupId = typeof to === "string" ? undefined : to.groupId;
        const userId = typeof to === "string" ? to : to.userId;

        const mentions = groupId
            ? await Promise.all(
                  messages
                      .filter(
                          (m): m is Protocol.MentionMessageSegment =>
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
                        this.loadFileFromId(message.data.file_id),
                        groupId ?? userId!
                    );
                    break;
            }
        }
        return true;
    }
}
