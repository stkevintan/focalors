import fs from "fs";
import { inject, InjectionToken } from "tsyringe";
import { YunzaiClient } from "@focalors/yunzai-client";
import { Configuration } from "./config";
import { logger } from "./logger";
import path from "path";

const interval = 30 * 60 * 1000;

export abstract class Wechat {
    constructor(
        @inject(Configuration) protected configuration: Configuration
    ) {}

    private timer?: NodeJS.Timer;
    protected startFileWatcher() {
        return setInterval(() => {
            void this.removeImagesHoursAgo();
        }, interval);
    }

    async start(): Promise<void> {
        this.timer = this.startFileWatcher();
    }
    async stop(): Promise<void> {
        clearInterval(this.timer);
    }

    abstract bridge(client: YunzaiClient): void;

    private async removeImagesHoursAgo() {
        const dir = this.configuration.imageCacheDirectory;
        try {
            const images = await fs.promises.readdir(dir);
            logger.debug("starting to remove outdated images");
            const ret = await Promise.allSettled(
                images.map(async (image) => {
                    const extname = path.extname(image);
                    if (extname === ".jpg") {
                        const fullpath = path.resolve(dir, image);
                        const stat = await fs.promises.stat(fullpath);
                        if (Date.now() - stat.atimeMs >= interval) {
                            await fs.promises.unlink(fullpath);
                        }
                    }
                })
            );
            logger.debug(
                `removed ${
                    ret.filter((r) => r.status === "fulfilled").length
                } outdated images`
            );
        } catch (err) {
            logger.debug("clear outdated images failed:", err);
        }
    }
}

export const WechatToken: InjectionToken<Wechat> = "wechat";
