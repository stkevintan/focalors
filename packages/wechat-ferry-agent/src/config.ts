import os from "os";
import path from "path";
import { WcferryOptions } from "@wcferry/core";
import { singleton } from "tsyringe";
import { randomUUID } from 'crypto';

@singleton()
export class WcfConfiguration {
    readonly redisUri = process.env["REDIS_URI"] ?? "redis://127.0.0.1:6379/1";
    readonly wcf: WcferryOptions = {
        port: 10086,
        host: "127.0.0.1",
        cacheDir: path.join(os.tmpdir(), `wcferry-${randomUUID()}`),
    };
}
