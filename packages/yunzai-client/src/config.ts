import { singleton } from "tsyringe";

@singleton()
export class Configuration {
    readonly ws = {
        port: 2536,
        path: "/ComWeChat",
        proto: "ws",
        host: `localhost`,
        get endpoint() {
            return `${this.proto}://${this.host}:${this.port}${this.path}`;
        },
        idleTimeout: 10 * 1000,
    };
    readonly user = {
        id: "10086",
        name: "user",
        displayName: "",
    };
}
