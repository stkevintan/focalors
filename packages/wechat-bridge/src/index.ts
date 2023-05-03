import "reflect-metadata";
import "./routes";

import {
    runClient,
    logger,
    YunzaiClient,
    container,
    Configuration,
} from "@focalors/yunzai-client";
import { handlers } from "./routes";

export async function run() {
    const client = await runClient(handlers);
    logger.info("Client is running...");
    await test(client);
}

function delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
}

async function test(client: YunzaiClient) {
    const configuration = container.resolve(Configuration);
    await client.sendMessageEvent(
        [{ type: "text", data: { text: "帮助" } }],
        configuration.friends[0].user_id
    );
}
