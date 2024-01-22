import "reflect-metadata";
import * as dotenv from "dotenv";
dotenv.config();

import { rootLogger } from "@focalors/logger";
import { Program } from "@focalors/wechat-bridge";
import { WechatFerry } from "@focalors/wechat-ferry-agent";
import { YunzaiClient } from "@focalors/yunzai-client";
import { GPTClient, Dalle3Client } from "@focalors/gpt-client";
import { RandomAbyssClient, SystemClient } from "@focalors/custom-client";


async function main() {
    try {
        const program = Program.create(
            WechatFerry, // <--- master
            // following slaves
            SystemClient,
            RandomAbyssClient,
            YunzaiClient,
            Dalle3Client,
            GPTClient
        );
        await program.start();
        process.send?.("ready");

        async function exitHandler() {
            rootLogger.info("Gracefully shutting down...");
            await program.stop().finally(() => {
                rootLogger.flush(() => process.exit(0));
            });
        }

        // catches ctrl+c event
        process.on("SIGINT", exitHandler);

        // catches "kill pid" (for example: nodemon restart)
        process.on("SIGUSR1", exitHandler);
        process.on("SIGUSR2", exitHandler);

        // catches uncaught exceptions
        process.on("uncaughtException", (e) => {
            rootLogger.error("Uncaught exception: %O", e);
        });

        // Windows graceful stop
        process.on("message", function (msg) {
            if (msg == "shutdown") {
                void exitHandler();
            }
        });
    } catch (err) {
        rootLogger.error(err);
    }
}

main();
