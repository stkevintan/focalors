import { singleton } from "tsyringe";

@singleton()
export class Configuration {
    readonly ws = {
        port: 2536,
        path: "/ComWeChat",
        proto: "ws",
        host: process.env['FOCALORS_YUNZAI_HOST'] ?? `localhost`,
        get endpoint() {
            return `${this.proto}://${this.host}:${this.port}${this.path}`;
        },
    };
}
