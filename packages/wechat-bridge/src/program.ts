import { Constructor } from "type-fest";
import { container, inject, injectable, injectAll, Lifecycle } from "tsyringe";
import {
    AsyncService,
    OnebotClient,
    OnebotClientToken,
    OnebotWechat,
    OnebotWechatToken,
} from "@focalors/onebot-protocol";

import { logger } from "./logger";

@injectable()
export class Program implements AsyncService {
    constructor(
        @inject(OnebotWechatToken) private wechat: OnebotWechat,
        @injectAll(OnebotClientToken) private clients: OnebotClient[]
    ) {}

    static create(
        wechatImpl: Constructor<OnebotWechat>,
        ...clientImpls: Constructor<OnebotClient>[]
    ) {
        container.register(OnebotWechatToken, wechatImpl, {
            lifecycle: Lifecycle.Singleton,
        });
        clientImpls.map((client) =>
            container.register(OnebotClientToken, client)
        );
        return container.resolve(Program);
    }

    async start() {
        this.clients.map((client) => {
            this.wechat.subscribe((message, target) =>
                client.receive(message, target)
            );

            client.subscribe((message, target) =>
                this.wechat.send(message, target)
            );
        });

        // wechat first
        await this.wechat.start();

        await Promise.all(this.clients.map((client) => client.start()));

        logger.info("program started");
    }

    async stop() {
        // swallow the error since we must ensure all the stop functions will be called.
        await Promise.allSettled([
            ...this.clients.map((client) => client.stop()),
            this.wechat.stop(),
        ]);
    }
}
