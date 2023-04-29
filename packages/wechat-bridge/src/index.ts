import "reflect-metadata";
import "./routes";

import { runClient, logger } from "@focalors/yunzai-client";
import { handlers } from "./routes";

export async function run() {
    const client = await runClient(handlers);
    await client.sendMessageEvent("帮助");
    logger.info("Client is running...");
}
