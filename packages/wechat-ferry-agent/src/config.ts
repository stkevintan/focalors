import os from "os";
import path from "path";
import { WcferryOptions } from "@wcferry/core";
import { singleton } from "tsyringe";
import { randomUUID } from 'crypto';

@singleton()
export class WcfConfiguration {
    readonly wcf: WcferryOptions = {
        port: 10086,
        host: "127.0.0.1",
        cacheDir: path.join(os.tmpdir(), `wcferry-${randomUUID()}`),
        socketOptions: {
            // recvTimeout: 60 * 1000
        }
    };
}
