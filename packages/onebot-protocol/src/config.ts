import fs from 'fs';
import os from 'os';
import path from 'path';
import { singleton } from "tsyringe";
import { logger } from "./logger";

@singleton()
export class Configuration {
    readonly botId: string = "focarlors";
    constructor() {
        try {
            fs.mkdirSync(this.imageCacheDirectory, { recursive: true });
        } catch (err) {
            logger.debug(`image cache directory create failed`, err);
        }
    }
    readonly imageCacheDirectory =
        process.env["FOCALORS_IMAGE_CACHE_DIR"] ||
        path.resolve(os.tmpdir(), "focarlors-cache");
}
