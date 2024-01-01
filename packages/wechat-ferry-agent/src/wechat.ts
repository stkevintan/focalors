import { inject, singleton } from "tsyringe";
import { Wechat } from "@focalors/wechat-bridge";
import { Protocol, YunzaiClient } from "@focalors/yunzai-client";
import { MessageType, UserInfo, WcfClient } from "./wcf";
import { logger } from "./logger";
import { WcfConfiguration } from "./config";
import assert from "assert";
import path from "path";
import { randomUUID } from "crypto";
import { FileBox } from "file-box";

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
        logger.info("wechat-ferry started");
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
                message.content,
                message.type
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
            if (!/^\s*#/.test(text)) {
                logger.warn(`Message without prefix #, skip...`);
            }

            logger.info("Received text:", text);
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

        client.on("upload_file", async (file) => {
            const dir = this.configuration.imageCacheDirectory;
            const name = randomUUID();
            const imagePath = path.resolve(dir, `${name}.jpg`);
            const filebox = toFileBox(file, `${name}.jpg`);
            if (filebox) {
                logger.info("successfully write image cache into:", imagePath);
                await filebox.toFile(imagePath, true);
            }

            return {
                file_id: name,
            };
        });
        client.on("get_version", async () => {
            return {
                impl: "ComWechat",
                version: "0.0.8",
                onebot_version: "0.0.8",
            };
        });
        client.sendReadySignal(this.currentUser!.wxid);
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

function toFileBox(
    file: Parameters<Protocol.UploadFileAction["handle"]>[0],
    name?: string
) {
    switch (file.type) {
        case "data":
            return FileBox.fromBase64(file.data, name);
        case "path":
            return FileBox.fromFile(file.path, name);
        case "url":
            return FileBox.fromUrl(file.url, { headers: file.headers, name });
    }
}
