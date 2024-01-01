import { format } from "util";
import { FileBox } from "file-box";
import { singleton } from "tsyringe";
import {
    Contact,
    Message,
    Room,
    ScanStatus,
    types,
    WechatyBuilder,
} from "wechaty";
import qrcodeTerminal from "qrcode-terminal";
import { logger } from "./logger";
import { Protocol, YunzaiClient } from "@focalors/yunzai-client";
import { Wechat } from "@focalors/wechat-bridge";
import assert from "assert";
import path from "path";
import { randomUUID } from "crypto";

@singleton()
export class Wechaty extends Wechat {
    private self = WechatyBuilder.build({ name: "focalors-bot" });
    override async start() {
        logger.info(
            "wechaty starts with puppet:",
            process.env["WECHATY_PUPPET"]
        );
        this.self.on("scan", onScan);
        await this.self.start();
        await this.self.ready();
        logger.info("wechat started");
    }

    override async stop() {
        await this.self.logout();
    }

    get bot() {
        return this.self;
    }

    override bridge(client: YunzaiClient) {
        // subscribe bot to client
        this.self.on("message", (message) => {
            const talker = message.talker();
            const room = message.room();
            if (message.type() !== types.Message.Text) {
                logger.debug(`unsupported message type: ${message.type()}`);
                return;
            }
            const type = message.talker().type();
            if (type !== types.Contact.Individual) {
                logger.debug("unsupported user type:", type);
                return;
            }
            const isRoom = room !== null;
            if (!isRoom && !talker.friend() && !message.self()) {
                logger.warn(
                    `unqualified user:`,
                    `room(${isRoom}), friend(${talker.friend()}), self(${message.self()})`
                );
                return;
            }

            let text = message.text();
            // only messages startsWith text will go on.
            if (!/^\s*#/.test(text)) {
                logger.warn(`message without prefix #`);
                return;
            }
            // if message startswith `#<space>`, remove the prefix.
            text = text.replace(/^\s*#\s+/, "");
            logger.info("message processing:", text);
            const segment: Protocol.MessageSegment[] = [
                {
                    type: "text",
                    data: { text },
                },
            ];
            if (room) {
                void client.send(segment, this.self.currentUser.id, {
                    groupId: room.id,
                    userId: talker.id,
                });
            } else {
                void client.send(segment, this.self.currentUser.id, talker.id);
            }
        });

        client.on("get_friend_list", async () => {
            const friends = await this.bot.Contact.findAll();
            return await Promise.all(
                friends.map(async (friend) => ({
                    user_id: friend.id,
                    user_name: friend.name(),
                    user_displayname: "",
                    user_remark: (await friend.alias()) ?? "",
                    "wx.verify_flag": friend.friend() ? "1" : "0",
                    "wx.avatar": friend.payload?.avatar,
                }))
            );
        });

        client.on("get_group_list", async () => {
            const groups = await this.bot.Room.findAll();
            return await Promise.all(
                groups.map(async (group) => ({
                    group_id: group.id,
                    group_name: await group.topic(),
                    "wx.avatar": group.payload?.avatar,
                }))
            );
        });

        client.on("get_group_member_info", async (params) => {
            const { user_id, group_id } = params;
            const user = await this.bot.Contact.find({ id: user_id });
            assert.ok(
                user != null,
                `user ${user_id} in ${group_id} is not found`
            );
            return {
                user_id,
                user_displayname: "",
                user_name: user.name(),
                "wx.avatar": user.payload?.avatar ?? "",
                "wx.wx_number": user_id,
                "wx.province": user.province(),
                "wx.city": user.city(),
            };
        });

        client.on("get_self_info", async () => {
            const user = this.bot.currentUser;
            return {
                user_id: user.id,
                user_name: user.name(),
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
                            user_id: this.bot.currentUser.id,
                        },
                    },
                ],
            };
        });

        client.on("send_message", async (params) => {
            let ok = false;
            try {
                if (params.detail_type === "private") {
                    const user = await this.bot.Contact.find({
                        id: params.user_id,
                    });
                    if (user) {
                        await this.sendMessageToUser(params.message, user);
                        ok = true;
                    }
                }
                if (params.detail_type === "group") {
                    const group = await this.bot.Room.find({
                        id: params.group_id,
                    });
                    const user = params.user_id
                        ? await this.bot.Contact.find({
                              id: params.user_id,
                          })
                        : undefined;
                    if (group) {
                        await this.sendMessageToGroup(
                            params.message,
                            group,
                            user
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
        client.sendReadySignal(this.bot.currentUser.id);
    }

    private async sendMessageToUser(
        messages: Protocol.MessageSegment[],
        user: Contact
    ) {
        let repliedMessage: Message | undefined = undefined;
        for (const message of messages) {
            switch (message.type) {
                case "reply":
                    repliedMessage = await this.bot.Message.find({
                        id: message.data.message_id,
                        fromId: message.data.user_id,
                    });
                    break;
                // merge adjacent text message?
                case "text":
                    await (repliedMessage ?? user).say(
                        stripCommandHeader(message.data.text, user.self())
                    );
                    repliedMessage = undefined;
                    break;
                case "image":
                case "wx.emoji":
                    // unable to reply with an image in wechat
                    await user.say(this.loadFileFromId(message.data.file_id));
                    break;
            }
        }
    }

    private async sendMessageToGroup(
        messages: Protocol.MessageSegment[],
        group: Room,
        user?: Contact
    ) {
        const mentions = (
            await Promise.all(
                messages
                    .filter(
                        (m): m is Protocol.MentionMessageSegment =>
                            m.type === "mention"
                    )
                    .map((m) => m.data.user_id)
                    .map(async (id) => this.bot.Contact.find({ id }))
            )
        ).filter((c): c is Contact => c != null);
        let repliedMessage: Message | undefined = undefined;
        for (const message of messages) {
            switch (message.type) {
                case "reply":
                    repliedMessage = await this.bot.Message.find({
                        id: message.data.message_id,
                        fromId: message.data.user_id,
                        roomId: group.id,
                    });
                    break;
                // merge adjacent text message?
                case "text":
                    await (repliedMessage ?? group).say(
                        stripCommandHeader(message.data.text, user?.self()),
                        ...mentions
                    );
                    repliedMessage = undefined;
                    break;
                case "image":
                case "wx.emoji":
                    // unable to reply with an image in wechat
                    await group.say(this.loadFileFromId(message.data.file_id));
                    break;
            }
        }
    }

    private loadFileFromId(id: string): FileBox {
        const imagePath = path.resolve(
            this.configuration.imageCacheDirectory,
            `${id}.jpg`
        );
        return FileBox.fromFile(imagePath);
    }
}

function onScan(qrcode: string, status: ScanStatus) {
    if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
        const qrcodeImageUrl = [
            "https://wechaty.js.org/qrcode/",
            encodeURIComponent(qrcode),
        ].join("");
        logger.info(
            format(
                "onScan: %s(%s) - %s",
                ScanStatus[status],
                status,
                qrcodeImageUrl
            )
        );

        qrcodeTerminal.generate(qrcode, { small: true }); // show qrcode on console
    } else {
        logger.info(format("onScan: %s(%s)", ScanStatus[status], status));
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
