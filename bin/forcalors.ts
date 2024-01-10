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

        async function exitHandler() {
            logger.info("\nGracefully shutting down...");
            await program.stop().finally(() => process.exit());
        }

        // catches ctrl+c event
        process.on("SIGINT", exitHandler);

        // catches "kill pid" (for example: nodemon restart)
        process.on("SIGUSR1", exitHandler);
        process.on("SIGUSR2", exitHandler);

        // catches uncaught exceptions
        process.on("uncaughtException", exitHandler);
    } catch (err) {
        logger.error(err);
    }
}

main();
