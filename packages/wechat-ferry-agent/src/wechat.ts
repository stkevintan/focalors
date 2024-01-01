import { inject, singleton } from "tsyringe";
import { Wechat } from "@focalors/wechat-bridge";
import { Protocol, YunzaiClient } from "@focalors/yunzai-client";
import { MessageType, UserInfo, WcfClient } from "./wcf";
import { logger } from "./logger";
import { WcfConfiguration } from "./config";
import assert from "assert";
import path from "path";

@singleton()
export class WechatFerry extends Wechat {
    constructor(
        @inject(WcfClient) private wcfClient: WcfClient,
        @inject(WcfConfiguration)
        protected override configuration: WcfConfiguration
    ) {
        super(configuration);
    }

    currentUser?: UserInfo;

    override async start(): Promise<void> {
        this.wcfClient.start();
        this.currentUser = await this.wcfClient.getCurrentUser();
    }

    override async stop(): Promise<void> {
        this.wcfClient.stop();
    }

    override bridge(client: YunzaiClient): void {
        assert(
            this.currentUser,
            "No current user, please make sure agent has been started"
        );
        this.wcfClient.on("message", (message) => {
            logger.info(
                "Received Message:",
                message.sender,
                message.isGroup,
                message.content
            );
            if (
                message.type !== MessageType.Text &&
                message.type !== MessageType.Reply
            ) {
                logger.debug(
                    `Unsupported message type: ${MessageType[message.type]} (${
                        message.type
                    })`
                );
                return;
            }
            if (message.isSelf) {
                logger.debug(`Self message, skip...`);
                return;
            }
            const text = message.text;
            if (!/^\s*#/.test(text)) {
                logger.debug(`Message without prefix #, skip...`);
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
                void client.send(
                    segment,
                    this.currentUser!.wxid,
                    message.sender
                );
            }
        });

        client.on("get_friend_list", async () => {
            const friends = await this.wcfClient.getFriendList();
            return friends.map((f) => ({
                user_id: f.wxid,
                user_name: f.name,
                user_displayname: f.name,
                user_remark: f.remark,
                // not supported
                // "wx.avatar": "",
                "wx.verify_flag": "1",
            }));
        });

        client.on("get_group_list", async () => {
            const groups = await this.wcfClient.getGroups();
            return groups.map((g) => ({
                group_id: g.wxid,
                group_name: g.name,
                // "wx.avatar": undefined,
            }));
        });

        client.on("get_group_member_info", async (params) => {
            const { user_id, group_id } = params;
            const user = await this.wcfClient.getGroupMember(group_id, user_id);
            return {
                user_id: user.wxid,
                user_name: user.name,
                user_displayname: "",
                "wx.wx_number": user_id,
                "wx.province": user?.province,
                "wx.city": user?.city,
                "wx.avatar": "",
            };
        });

        client.on("get_self_info", async () => {
            return {
                user_id: this.currentUser!.wxid,
                user_name: this.currentUser!.name,
                user_displayname: "",
            };
        });

        client.on("get_status", async () => {
            return {
                good: true,
                bots: [
                    {
                        online: true,
                        self: {
                            platform: "wechat",
                            user_id: this.currentUser!.wxid,
                        },
                    },
                ],
            };
        });

        client.on("send_message", async (params) => {
            let ok = false;
            try {
                if (params.detail_type === "private") {
                    const user = await this.wcfClient.getContact(
                        params.user_id
                    );
                    if (user) {
                        await this.sendMessageToUser(params.message, user.wxid);
                        ok = true;
                    }
                }
                if (params.detail_type === "group") {
                    const group = await this.wcfClient.getContact(
                        params.group_id
                    );
                    const user = params.user_id
                        ? await this.wcfClient.getGroupMember(
                              params.group_id,
                              params.user_id
                          )
                        : undefined;
                    if (group) {
                        await this.sendMessageToGroup(
                            params.message,
                            group.wxid,
                            user?.wxid
                        );
                        ok = true;
                    }
                }
            } catch (err) {
                logger.error("Error while sending message:", err);
                ok = false;
            }
            return ok;
        });
    }

    private async sendMessageToUser(
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
                    await this.wcfClient.sendText(
                        stripCommandHeader(
                            message.data.text,
                            userId === this.currentUser!.wxid
                        ),
                        userId
                    );
                    break;
                case "image":
                case "wx.emoji":
                    // unable to reply with an image in wechat
                    await this.wcfClient.sendImage(
                        this.loadFileFromId(message.data.file_id),
                        userId
                    );
                    break;
            }
        }
    }

    private async sendMessageToGroup(
        messages: Protocol.MessageSegment[],
        groupId: string,
        userId?: string
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
                    await this.wcfClient.sendText(
                        stripCommandHeader(
                            message.data.text,
                            userId === this.currentUser!.wxid
                        ),
                        groupId,
                        mentions
                    );
                    // repliedMessage = undefined;
                    break;
                case "image":
                case "wx.emoji":
                    // unable to reply with an image in wechat
                    await this.wcfClient.sendImage(
                        this.loadFileFromId(message.data.file_id),
                        groupId
                    );
                    break;
            }
        }
    }

    private loadFileFromId(id: string): string {
        const imagePath = path.resolve(
            this.configuration.imageCacheDirectory,
            `${id}.jpg`
        );
        return imagePath;
    }
}

function stripCommandHeader(text: string, shouldDo = false) {
    if (shouldDo) {
        return text.replace(/^\s*#*/g, "");
    }
    return text;
}
