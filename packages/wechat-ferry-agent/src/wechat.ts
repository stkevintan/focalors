import { inject, singleton } from "tsyringe";
import { Wechat } from "@focalors/wechat-bridge";
import { Protocol, YunzaiClient } from "@focalors/yunzai-client";
import { MessageType, UserInfo, WcfClient, WcfMessage } from "./wcf";
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
    protected override bridgeForward(
        client: YunzaiClient,
        message: WcfMessage
    ): void {
        logger.debug(
            "Received Message:",
            message.sender,
            "group:",
            message.isGroup,
            "type:",
            message.type,
            message.text
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

        const text = message.text;
        if (!/^\s*[#*]/.test(text)) {
            logger.warn(`Message without prefix # or, skip...`);
        }

        const segment: Protocol.MessageSegment[] = [
            {
                type: "text",
                data: { text },
            },
        ];

        if (message.isGroup) {
            void client.send(segment, this.currentUser!.wxid, {
                groupId: message.roomId,
                userId: message.sender,
            });
        } else {
            void client.send(segment, this.currentUser!.wxid, message.sender);
        }
    }

    protected override async bridgeGetFriendList(): Promise<
        Protocol.FriendInfo[]
    > {
        const friends = await this.bot.getFriendList();
        return friends.map((f) => ({
            user_id: f.wxid,
            user_name: f.name,
            user_displayname: f.name,
            user_remark: f.remark,
            // not supported
            // "wx.avatar": "",
            "wx.verify_flag": "1",
        }));
    }

    protected override async bridgeGetGroupList(): Promise<
        Protocol.GroupInfo[]
    > {
        const groups = await this.bot.getGroups();
        return groups.map((g) => ({
            group_id: g.wxid,
            group_name: g.name,
            // "wx.avatar": undefined,
        }));
    }

    protected override async bridgeGetGroupMemberInfo(
        params: Protocol.ActionParam<Protocol.GetGroupMemberInfoAction>
    ): Promise<Protocol.ActionReturn<Protocol.GetGroupMemberInfoAction>> {
        const { user_id, group_id } = params;
        const user = await this.bot.getGroupMember(group_id, user_id);
        return {
            user_id: user.wxid,
            user_name: user.name,
            user_displayname: "",
            "wx.wx_number": user_id,
            "wx.province": user?.province,
            "wx.city": user?.city,
            "wx.avatar": "",
        };
    }

    protected async sendMessageToUser(
        messages: Protocol.MessageSegment[],
        userId: string
    ) {
        for (const message of messages) {
            switch (message.type) {
                case "reply":
                    // repliedMessage = await this.bot.Message.find({
                    //     id: message.data.message_id,
                    //     fromId: message.data.user_id,
                    // });
                    break;
                // merge adjacent text message?
                case "text":
                    await this.bot.sendText(message.data.text, userId);
                    break;
                case "image":
                case "wx.emoji":
                    // unable to reply with an image in wechat
                    await this.bot.sendImage(
                        this.loadFileFromId(message.data.file_id),
                        userId
                    );
                    break;
            }
        }
        return true;
    }

    protected async sendMessageToGroup(
        messages: Protocol.MessageSegment[],
        groupId: string
        // userId?: string
    ) {
        const mentions = await Promise.all(
            messages
                .filter(
                    (m): m is Protocol.MentionMessageSegment =>
                        m.type === "mention"
                )
                .map((m) => m.data.user_id)
        );
        for (const message of messages) {
            switch (message.type) {
                case "reply":
                    mentions.push(message.data.user_id);
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
                        groupId,
                        mentions
                    );
                    // repliedMessage = undefined;
                    break;
                case "image":
                case "wx.emoji":
                    // unable to reply with an image in wechat
                    await this.bot.sendImage(
                        this.loadFileFromId(message.data.file_id),
                        groupId
                    );
                    break;
            }
        }
        return true;
    }
}