import { singleton } from "tsyringe";

@singleton()
export class WcfConfiguration {
    // host to receive wcf messages
    readonly wcfCallback = {
        port: 8888,
        host: "127.0.0.1",
    };

    // server to send message to wcf
    readonly wcfApi = {
        port: 9999,
        host: "127.0.0.1",
    };

    readonly wcfProto = {
        port: 10086,
        host: '127.0.0.1'
    }
}
