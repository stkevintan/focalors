import { singleton } from "tsyringe";

@singleton()
export class Configuration {
    readonly masterId = process.env["MASTER_ID"];
    readonly redisUri = process.env["REDIS_URI"];
}