import "reflect-metadata";
import * as dotenv from "dotenv";
dotenv.config();

import { createLogger } from "@focalors/logger";
import { Program } from "@focalors/wechat-bridge";
import { WechatFerry } from "@focalors/wechat-ferry-agent";
import path from "path";
import { YunzaiClient } from "@focalors/yunzai-client";
import { GPTClient } from "@focalors/gpt-client";


const logger = createLogger({
    name: "forcalors",
    filename: path.resolve(__dirname, "../logs/stdout"),
});

async function main() {
    try {
        // TODO: start wechat and redis beforehand.
        const program = Program.create(WechatFerry, YunzaiClient, GPTClient);
        await program.start();
        process.on("SIGINT", async () => {
            logger.info("\nGracefully shutting down from SIGINT (Ctrl+C)");
            await program.stop().finally(() => process.exit());
        });
    } catch (err) {
        logger.error(err);
    }
}

main();
