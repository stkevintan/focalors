import path from "path";
import os from "os";
import fs from "fs";
import { singleton } from "tsyringe";
import { logger } from "./logger";

@singleton()
export class Configuration {
    constructor() {
        try {
            fs.mkdirSync(this.imageCacheDirectory, { recursive: true });
        } catch (err) {
            logger.debug(`image cache directory create failed`, err);
        }
    }
    readonly imageCacheDirectory =
        process.env["FOCALORS_IMAGE_CACHE_DIR"] ||
        path.resolve(os.tmpdir(), "yunzai-cache");
}
