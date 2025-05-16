import { singleton } from "tsyringe";

@singleton()
export class XYWechatConfiguration {
    readonly redisUri = process.env["REDIS_URI"] || "redis://localhost:6379";
    readonly hostIP = process.env["XYW_HOST_IP"] || "127.0.0.1";
    readonly hostPort = +(process.env["XYW_HOST_PORT"] || 9000);
    readonly hostMode = process.env["XYW_HOST_MODE"] || "release";
    readonly databaseFolder = process.env["DATABASE_FOLDER"] || "/db";
}
