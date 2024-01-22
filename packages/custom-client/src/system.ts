import { createLogger, Logger } from "@focalors/logger";
import {
    AccessManager,
    injectAccessManager,
    matchPattern,
    MessageSegment,
    MessageTarget2,
    OnebotClient,
    OnebotWechat,
    OnebotWechatToken,
} from "@focalors/onebot-protocol";
import { inject, injectable } from "tsyringe";

const logger: Logger = createLogger('system-client');

@injectable()
export class SystemClient extends OnebotClient {
    constructor(
        @inject(OnebotWechatToken) wechat: OnebotWechat,
        @injectAccessManager("system") private accessManager: AccessManager
    ) {
        super(wechat);
    }

    async recv(
        message: MessageSegment[],
        from: MessageTarget2
    ): Promise<boolean> {
        if (
            matchPattern(message, /^\/shutdown$/) &&
            typeof from === "string" &&
            (await this.accessManager.check(from))
        ) {
            await this.wechat.stop();
            logger.info('wechat stopped');
            return true;
        }
        return false;
    }
}
