import "reflect-metadata";
import * as dotenv from "dotenv";
import { container } from "tsyringe";
import "./routes";

import {
    Configuration as YunzaiConfiguration,
    Protocol,
    YunzaiClient,
} from "@focalors/yunzai-client";
import { createWechaty } from "./wechaty";
import { logger } from "./logger";
import { Configuration } from "./config";
import { types } from "wechaty";

dotenv.config();

// override the configuration
container.register(YunzaiConfiguration, { useToken: Configuration });

export async function run() {
    const bot = await createWechaty();
    logger.info("bot started...");
    const client = container.resolve(YunzaiClient);
    await client.run(bot.currentUser.id);
    // subscribe bot to client
    bot.on("message", (message) => {
        const talker = message.talker();
        const room = message.room();
        if (message.type() !== types.Message.Text) {
            logger.debug(
                "message stop processing:",
                "unexpected message type:",
                message.type()
            );
            return;
        }
        const type = message.talker().type();
        if (type !== types.Contact.Individual) {
            logger.debug(
                "message stop processing:",
                "unexpected talker:",
                type
            );
            return;
        }
        const isRoom = room !== null;

        if (!isRoom && !talker.friend() && !message.self()) {
            logger.warn(
                `message stop processing: user is not qualified`,
                `room: ${isRoom}, friend: ${talker.friend()}, self: ${message.self()}`
            );
            return;
        }

        let text = message.text();
        // only messages startsWith text will go on.
        if (!/^\s*#/.test(text)) {
            logger.warn(
                "message stop processing:",
                `text doesn't prefix with #`
            );
            return;
        }
        // if message startswith `#<space>`, remove the prefix.
        text = text.replace(/^\s*#\s+/, "");
        logger.info("receive message:", text);
        const segment: Protocol.MessageSegment[] = [
            {
                type: "text",
                data: { text },
            },
        ];
        if (room) {
            void client.sendMessageEvent(segment, {
                groupId: room.id,
                userId: talker.id,
            });
        } else {
            void client.sendMessageEvent(segment, talker.id);
        }
    });
    logger.info("Focalors is running...");
}
