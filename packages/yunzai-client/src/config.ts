import { singleton } from "tsyringe";
import { Configuration as BaseConfiguration } from "@focalors/onebot-protocol";

@singleton()
export class Configuration extends BaseConfiguration {
    readonly ws = {
        port: 2536,
        path: "/ComWeChat",
        proto: "ws",
        host: process.env["FOCALORS_YUNZAI_HOST"] ?? `localhost`,
        get endpoint() {
            return `${this.proto}://${this.host}:${this.port}${this.path}`;
        },
    };
    override readonly botId = "yunzai";
}
