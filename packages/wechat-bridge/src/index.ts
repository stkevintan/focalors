import "reflect-metadata";
import * as dotenv from "dotenv";
import { container, inject, injectable } from "tsyringe";
// init routes
import "./routes";
import {
    Configuration as YunzaiConfiguration,
    YunzaiClient,
} from "@focalors/yunzai-client";
import { Wechat } from "./wechat";
import { logger } from "./logger";
import { Configuration } from "./config";

dotenv.config();

// override the configuration
container.register(YunzaiConfiguration, { useToken: Configuration });

@injectable()
export class Program {
    constructor(
        @inject(YunzaiClient) private client: YunzaiClient,
        @inject(Wechat) private wechat: Wechat
    ) {}

    async start() {
        await this.wechat.run();
        logger.info("wechat is running...");
        await this.client.start();
        logger.info("client is running...");
        // bridge wechat and client
        this.wechat.bridge(this.client);
    }
}

export function entrypoint() {
    return container.resolve(Program);
}
