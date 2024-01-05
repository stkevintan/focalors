import { format } from "util";
import { singleton } from "tsyringe";
import { Contact, Message, ScanStatus, types, WechatyBuilder } from "wechaty";
import qrcodeTerminal from "qrcode-terminal";
import {
    FriendInfo,
    GroupInfo,
    MentionMessageSegment,
    MessageSegment,
    MessageTarget2,
    OnebotWechat,
} from "@focalors/onebot-protocol";
import { logger } from "./logger";
import assert from "assert";

@singleton()
export class Wechaty extends OnebotWechat {
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

    override subscribe(
        callback: (message: MessageSegment[], from: MessageTarget2) => void
    ) {
        this.bot.on("message", (message) => {
            const talker = message.talker();
            if (talker.self()) {
                logger.warn(`Self message, skip...`);
                return;
            }
            const room = message.room();
            const segment: MessageSegment[] = [];
            switch (message.type()) {
                case types.Message.Text:
                    segment.push({
                        type: "text",
                        data: { text: message.text() },
                    });
            }
            callback(
                segment,
                room ? { groupId: room.id, userId: talker.id } : talker.id
            );
        });
    }

    override async getFriends(): Promise<FriendInfo[]> {
        const friends = await this.bot.Contact.findAll();
        return await Promise.all(
            friends.map(async (friend) => ({
                user_id: friend.id,
                user_name: friend.name(),
                user_displayname: "",
                user_remark: (await friend.alias()) ?? "",
                "wx.avatar": friend.payload?.avatar,
            }))
        );
    }

    override async getGroups(): Promise<GroupInfo[]> {
        const groups = await this.bot.Room.findAll();
        return await Promise.all(
            groups.map(async (group) => ({
                group_id: group.id,
                group_name: await group.topic(),
                "wx.avatar": group.payload?.avatar,
            }))
        );
    }

    override async getFriend(
        userId: string,
        groupId?: string
    ): Promise<FriendInfo> {
        const user = await this.bot.Contact.find({ id: userId });
        assert.ok(user != null, `user ${userId} in ${groupId} is not found`);
        return {
            user_id: userId,
            user_displayname: "",
            user_name: user.name(),
            "wx.avatar": user.payload?.avatar ?? "",
        };
    }

    override async send(
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
                case "image":
                case "wx.emoji":
                    // unable to reply with an image in wechat
                    await target.say(message.data.file_id);
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
