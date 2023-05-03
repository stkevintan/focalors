import path from "path";
import { Protocol } from "@focalors/yunzai-client";
import { FileBox } from "file-box";
import { Configuration } from "src/config";
import { TOKENS } from "src/tokens";

import { inject, singleton } from "tsyringe";
import { Contact, Message, Room, Wechaty } from "wechaty";

@singleton()
export class SendMessageRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.SendMessageAction>
{
    constructor(
        @inject(Configuration) private configuration: Configuration,
        @inject(TOKENS.wechaty) private bot: Wechaty
    ) {}
    readonly action = "send_message";
    async handle(
        req: Protocol.SendMessageAction[0]
    ): Promise<Protocol.SendMessageAction[1]> {
        // TODO: send message to user
        const { params } = req;
        let ok = false;
        if (params.detail_type === "private") {
            const user = await this.bot.Contact.find({ id: params.user_id });
            if (user) {
                await this.sendMessageToUser(params.message, user);
                ok = true;
            }
        }
        if (params.detail_type === "group") {
            const group = await this.bot.Room.find({ id: params.group_id });
            if (group) {
                await this.sendMessageToGroup(params.message, group);
                ok = true;
            }
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
                    await (repliedMessage ?? user).say(message.data.text);
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
        group: Room
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
                        message.data.text,
                        ...mentions
                    );
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
        return FileBox.fromFile(imagePath, id);
    }
}
