import { format } from "util";
import { inject, singleton } from "tsyringe";
import { Contact, Message, ScanStatus, types, WechatyBuilder } from "wechaty";
import qrcodeTerminal from "qrcode-terminal";
import {
    FileCache,
    FriendInfo,
    GroupInfo,
    MentionMessageSegment,
    MessageSegment,
    MessageTarget2,
    OnebotWechat,
    UploadFileAction,
} from "@focalors/onebot-protocol";
import assert from "assert";
import { FileBox } from "file-box";
import { createLogger } from "@focalors/logger";
import { randomUUID } from "crypto";
import path from "path";
import { WechatMessageType } from "./types";
import { gif2Mp4 } from "./gif2Mp4";

const logger = createLogger("wechaty-agent");

@singleton()
export class Wechaty implements OnebotWechat {
    protected bot = WechatyBuilder.build({ name: "focalors-bot" });
    get self() {
        return {
            id: this.bot.currentUser.id,
            name: this.bot.currentUser.name(),
        };
    }

    constructor(@inject(FileCache) protected fileCache: FileCache) {}

    async start() {
        logger.info(
            "wechaty starts with puppet:",
            process.env["WECHATY_PUPPET"]
        );
        await this.bot.start();
        this.bot.on("scan", onScan);
        await this.bot.ready();
        await new Promise<void>((res) =>
            this.bot.once("login", () => {
                logger.info("wechaty logged in");
                res();
            })
        );
        logger.info("wechat started");
    }

    async stop() {
        await this.bot.logout();
        await this.bot.stop();
    }

    subscribe(
        callback: (message: MessageSegment[], from: MessageTarget2) => void
    ) {
        this.bot.on("message", async (message) => {
            const talker = message.talker();
            if (talker.self()) {
                logger.warn(`Self message, skip...`);
                return;
            }
            const room = message.room();
            const segment: MessageSegment[] = [];
            const mentions = await message.mentionList().catch(() => []);
            segment.push(
                ...mentions.map<MentionMessageSegment>((m) => ({
                    type: "mention",
                    data: {
                        user_id: m.id,
                        is_self: m.self(),
                    },
                }))
            );

            logger.debug(
                "Recv message %s, payload: %O",
                types.Message[message.type()],
                message.payload
            );
            switch (message.type()) {
                case types.Message.Text:
                    segment.push(...this.parseText(message));
            }
            callback(
                segment,
                room ? { groupId: room.id, userId: talker.id } : talker.id
            );
        });
    }
    private parseText(message: Message): MessageSegment[] {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (message.payload as any)?.rawPayload;
        if (!raw?.refermsg) {
            return [
                {
                    type: "text",
                    data: { text: message.text() },
                },
            ];
        }
        const referMessagePayload = raw.refermsg;
        const referMessageType = parseInt(referMessagePayload.type);
        logger.debug("Got refer message: %O", referMessagePayload);
        return [
            {
                type: "reply",
                data: {
                    user_id: referMessagePayload.chatusr,
                    message_id: referMessagePayload.svrid,
                    message_content: referMessagePayload.content,
                    message_type:
                        referMessageType === WechatMessageType.Image ||
                        referMessageType === WechatMessageType.Emoticon
                            ? "image"
                            : referMessageType === WechatMessageType.Text
                            ? "text"
                            : "others",
                },
            },
            {
                type: "text",
                data: {
                    text: raw.title ?? "",
                },
            },
        ];
    }

    async getGroupMembers(roomId: string): Promise<Record<string, string>> {
        const room = await this.bot.Room.find({ id: roomId });
        const members = await room?.memberAll();
        if (!members) {
            return {};
        }
        // get alias: room.alias(member);
        return Object.fromEntries(
            members.map((member) => [member.id, member.name()])
        );
    }

    async uploadFile(file: UploadFileAction["req"]): Promise<string> {
        return await this.fileCache.cache(file);
    }

    async downloadImage(msgId: string): Promise<string> {
        logger.info(`Downloading image in msgId: ${msgId}`);
        const cachedFile = await this.fileCache.getByMessage(msgId);
        if (cachedFile) {
            logger.debug(`Downloading image from cache`);
            const filebox = await this.toFileBox(cachedFile, ".jpg");
            if (filebox) {
                return await filebox.toDataURL();
            }
        }
        const msg = await this.bot.Message.find({ id: msgId });
        assert(msg, `Failed to find message by id: ${msgId}`);
        logger.debug("Downloaded target message: %O", msg.payload);
        const filebox = await msg.toFileBox();
        return await filebox.toDataURL();
    }

    async getFriends(): Promise<FriendInfo[]> {
        const friends = await this.bot.Contact.findAll();
        return await Promise.all(
            friends
                .filter((f) => f.friend())
                .map(async (friend) => ({
                    user_id: friend.id,
                    user_name: friend.name(),
                    user_displayname: "",
                    user_remark: (await friend.alias()) ?? "",
                    "wx.avatar": friend.payload?.avatar,
                }))
        );
    }

    async getGroups(): Promise<GroupInfo[]> {
        const groups = await this.bot.Room.findAll();
        return await Promise.all(
            groups.map(async (group) => ({
                group_id: group.id,
                group_name: await group.topic(),
                "wx.avatar": group.payload?.avatar,
            }))
        );
    }

    async getFriend(userId: string, groupId?: string): Promise<FriendInfo> {
        const user = await this.bot.Contact.find({ id: userId });
        assert.ok(user != null, `user ${userId} in ${groupId} is not found`);
        return {
            user_id: userId,
            user_displayname: "",
            user_name: user.name(),
            "wx.avatar": user.payload?.avatar ?? "",
        };
    }

    async send(
        messages: MessageSegment[],
        to: string | { groupId: string; userId?: string }
    ) {
        const { groupId, userId } =
            typeof to === "string" ? { userId: to, groupId: undefined } : to;

        const target = groupId
            ? await this.bot.Room.find({ id: groupId })
            : userId
            ? await this.bot.Contact.find({ id: userId })
            : undefined;
        if (!target) {
            return false;
        }
        const mentions = (
            await Promise.all(
                messages
                    .filter(
                        (m): m is MentionMessageSegment => m.type === "mention"
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
                        roomId: groupId,
                    });
                    break;
                // merge adjacent text message?
                case "text":
                    await (repliedMessage ?? target).say(
                        message.data.text,
                        ...mentions
                    );
                    repliedMessage = undefined;
                    break;
                case "image": {
                    const filebox = await this.toFileBox(
                        message.data.file_id,
                        ".jpg"
                    );
                    const msg = await target.say(filebox ?? "[图片]");
                    await this.linkResource(msg, message.data.file_id);
                    break;
                }
                case "file": {
                    const filebox = await this.toFileBox(
                        message.data.file_id,
                        ".dat"
                    );
                    const msg = await target.say(filebox ?? "[文件]");
                    await this.linkResource(msg, message.data.file_id);
                    break;
                }
                case "wx.emoji": {
                    const filebox = await this.toFileBox(
                        message.data.file_id,
                        ".gif"
                    );
                    // send gif as mp4
                    if (filebox) {
                        const mp4 = await gif2Mp4(filebox);
                        await target.say(mp4);
                        break;
                    }
                    const msg = await target.say(filebox ?? "[表情]");
                    await this.linkResource(msg, message.data.file_id);
                    break;
                }

                case "card": {
                    const link = new this.bot.UrlLink({
                        thumbnailUrl: message.data.thumburl,
                        description: message.data.digest,
                        title: message.data.title,
                        url: message.data.url,
                    });
                    await target.say(link);
                }
            }
        }
        return true;
    }

    private async linkResource(message: Message | void, fileId: string) {
        if (message) {
            const ok = await this.fileCache.addMessageLink(message.id, fileId);
            logger.debug(
                "%s to link message %s with file %s",
                ok ? "Succeeded" : "Failed",
                message.id,
                fileId
            );
        }
    }

    private async toFileBox(
        idOrPayload: string | UploadFileAction["req"],
        defaultExt = ".dat"
    ): Promise<FileBox | undefined> {
        let payload: UploadFileAction["req"] | undefined = undefined;
        if (typeof idOrPayload === "string") {
            payload = await this.fileCache.get(idOrPayload);
        } else {
            payload = idOrPayload;
        }

        if (!payload) {
            return undefined;
        }

        let name = payload.name ?? randomUUID();
        name = name.replace(/\?[^.]*$/, '');
        if (!path.extname(name)) {
            name += defaultExt;
        }

        switch (payload.type) {
            case "url":
                return FileBox.fromUrl(payload.url, {
                    headers: payload.headers,
                    name,
                });
            case "data":
                return FileBox.fromBase64(payload.data, name);
            case "path":
                return FileBox.fromFile(payload.path, name);
            default:
                logger.warn("Cannot upload file:", payload);
                return undefined;
        }
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
