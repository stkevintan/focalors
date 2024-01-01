import 'reflect-metadata';
import { createLogger } from "@focalors/logger";
import { Program } from "@focalors/wechat-bridge";
import { WechatFerry } from "@focalors/wechat-ferry-agent";
import path from "path";
import * as dotenv from 'dotenv';

dotenv.config();

const logger = createLogger({
    name: "forcalors",
    filename: path.resolve(__dirname, "../logs/stdout"),
});

async function main() {
    try {
        const program = Program.create(WechatFerry);
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
