import "reflect-metadata";
import "./routes";

import { runClient, logger } from "@focalors/yunzai-client";

export async function run() {
    const client = await runClient();
    await client.sendMessageEvent("帮助");
    logger.info("Client is running...");
}
