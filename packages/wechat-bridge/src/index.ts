import "reflect-metadata";
import * as dotenv from "dotenv";
import { container, inject, injectable } from "tsyringe";
// init routes
import "./routes";
import {
    AsyncService,
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
export class Program implements AsyncService {
    constructor(
        @inject(YunzaiClient) private client: YunzaiClient,
        @inject(Wechat) private wechat: Wechat
    ) {}

    static create() {
        return container.resolve(Program);
    }

    async start() {
        // wechat first
        await this.wechat.start();
        await this.client.start();
        // bridge wechat and client
        this.wechat.bridge(this.client);
        logger.info("program started");
    }

    async stop() {
        // swallow the error since we must ensure all the stop functions will be called.
        await Promise.allSettled([this.client.stop(), this.wechat.stop()]);
    }
}
