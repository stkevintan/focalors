import { singleton } from "tsyringe";
import { Configuration } from "@focalors/wechat-bridge";

@singleton()
export class WcfConfiguration extends Configuration {
    // host to receive wcf messages
    readonly wcfHost = {
        port: 8888,
        host: "127.0.0.1",
    };

    // server to send message to wcf
    readonly wcfServer = {
        port: 9999,
        host: "127.0.0.1",
    };
}
