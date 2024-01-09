import { singleton } from "tsyringe";

@singleton()
export class WcfConfiguration {
    readonly wcfProto = {
        port: 10086,
        host: '127.0.0.1'
    }
}
