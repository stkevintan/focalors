import path from "path";
import { Protocol } from "@focalors/yunzai-client";
import { inject, injectable } from "tsyringe";
import { Contact, Message, Room } from "wechaty";
import { FileBox } from "file-box";
import { Configuration } from "../config";
import { logger } from "../logger";
import { Wechat } from "../wechat";

@injectable()
export class SendMessageRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.SendMessageAction>
{
    constructor(
        @inject(Configuration) private configuration: Configuration,
        @inject(Wechat) private wechat: Wechat
    ) {}
    readonly action = "send_message";

    private get bot() {
        return this.wechat.bot;
    }

    async handle(
        req: Protocol.SendMessageAction[0]
    ): Promise<Protocol.SendMessageAction[1]> {
        const { params } = req;
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
                const group = await this.bot.Room.find({ id: params.group_id });
                const user = params.user_id
                    ? await this.bot.Contact.find({
                          id: params.user_id,
                      })
                    : undefined;
                if (group) {
                    await this.sendMessageToGroup(params.message, group, user);
                    ok = true;
                }
            }
        } catch (err) {
            logger.error("Error while sending message:", err);
            ok = false;
        }
        return {
            echo: req.echo,
            data: ok,
        };
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
function stripCommandHeader(text: string, shouldDo = false) {
    if (shouldDo) {
        return text.replace(/^\s*#*/g, "");
    }
    return text;
}
