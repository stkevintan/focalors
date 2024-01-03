import { format } from "util";
import { singleton } from "tsyringe";
import { Contact, Message, ScanStatus, types, WechatyBuilder } from "wechaty";
import qrcodeTerminal from "qrcode-terminal";
import { logger } from "./logger";
import type { Protocol, YunzaiClient } from "@focalors/yunzai-client";
import { Wechat } from "@focalors/wechat-bridge";
import assert from "assert";

@singleton()
export class Wechaty extends Wechat {
    protected bot = WechatyBuilder.build({ name: "focalors-bot" });
    override get self() {
        return {
            id: this.bot.currentUser.id,
            name: this.bot.currentUser.name(),
        };
    }
    override async start() {
        logger.info(
            "wechaty starts with puppet:",
            process.env["WECHATY_PUPPET"]
        );
        this.bot.on("scan", onScan);
        await this.bot.start();
        await this.bot.ready();
        logger.info("wechat started");
    }

    override async stop() {
        await this.bot.logout();
    }

    override bridge(client: YunzaiClient): void {
        this.bot.on("message", (message) => {
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
                void client.forward(segment, {
                    groupId: room.id,
                    userId: talker.id,
                });
            } else {
                void client.forward(segment, talker.id);
            }
        });
    }

    override async getFriendList(): Promise<Protocol.FriendInfo[]> {
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
    }

    override async getGroupList(): Promise<Protocol.GroupInfo[]> {
        const groups = await this.bot.Room.findAll();
        return await Promise.all(
            groups.map(async (group) => ({
                group_id: group.id,
                group_name: await group.topic(),
                "wx.avatar": group.payload?.avatar,
            }))
        );
    }

    override async getGroupMemberInfo(
        params: Protocol.ActionParam<Protocol.GetGroupMemberInfoAction>
    ): Promise<Protocol.ActionReturn<Protocol.GetGroupMemberInfoAction>> {
        const { user_id, group_id } = params;
        const user = await this.bot.Contact.find({ id: user_id });
        assert.ok(user != null, `user ${user_id} in ${group_id} is not found`);
        return {
            user_id,
            user_displayname: "",
            user_name: user.name(),
            "wx.avatar": user.payload?.avatar ?? "",
            "wx.wx_number": user_id,
            "wx.province": user.province(),
            "wx.city": user.city(),
        };
    }

    override async send(
        messages: Protocol.MessageSegment[],
        contactId: string
    ) {
        const group = await this.bot.Room.find({ id: contactId });
        const contact =
            group || (await this.bot.Contact.find({ id: contactId }));
        if (!contact) {
            return false;
        }
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
                        roomId: group?.id,
                    });
                    break;
                // merge adjacent text message?
                case "text":
                    await (repliedMessage ?? contact).say(
                        message.data.text,
                        ...mentions
                    );
                    repliedMessage = undefined;
                    break;
                case "image":
                case "wx.emoji":
                    // unable to reply with an image in wechat
                    await contact.say(
                        this.loadFileFromId(message.data.file_id)
                    );
                    break;
            }
        }
        return true;
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
