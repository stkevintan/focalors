import "reflect-metadata";
import "./routes";

import {
    container,
    Configuration as YunzaiConfiguration,
    Protocol,
    YunzaiClient,
} from "@focalors/yunzai-client";
import { runBot } from "./wechaty";
import { logger } from "./logger";
import { Configuration } from "./config";

// override the configuration
container.registerSingleton(YunzaiConfiguration, Configuration);

export async function run() {
    const bot = await runBot();
    logger.info("bot started...");
    const client = container.resolve(YunzaiClient);
    await client.run();
    // subscribe bot to client
    bot.on("message", (message) => {
        const text = message.text();
        const segment: Protocol.MessageSegment[] = [
            {
                type: "text",
                data: { text },
            },
        ];
        const roomId = message.room();
        if (roomId) {
            void client.sendMessageEvent(segment, roomId.id, "group");
        }
        const userId = message.listener();
        if (userId) {
            void client.sendMessageEvent(segment, userId.id, "private");
        }
    });
    logger.info("Focalors is running...");
}
