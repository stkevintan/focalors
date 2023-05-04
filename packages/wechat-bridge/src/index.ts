import "reflect-metadata";
import * as dotenv from "dotenv";
import { container, inject, injectable } from "tsyringe";
// init routes
import "./routes";
import {
    Configuration as YunzaiConfiguration,
    YunzaiClient,
} from "@focalors/yunzai-client";
import { Wechat } from "./wechaty";
import { logger } from "./logger";
import { Configuration } from "./config";

dotenv.config();

// override the configuration
container.register(YunzaiConfiguration, { useToken: Configuration });

@injectable()
class Program {
    constructor(
        @inject(YunzaiClient) private client: YunzaiClient,
        @inject(Wechat) private wechat: Wechat
    ) {}

    async start() {
        await this.wechat.run();
        logger.info("wechat is running...");
        await this.client.run();
        logger.info("client is running...");
        // bridge wechat and client
        this.wechat.bridge(this.client);
    }
}

export async function run() {
    await container.resolve(Program).start();
    logger.info("Focalors is running...");
}
