import { Constructor } from "type-fest";
import { container, inject, injectable, injectAll, Lifecycle } from "tsyringe";
import {
    AsyncService,
    OnebotClient,
    OnebotClientToken,
    OnebotWechat,
    OnebotWechatToken,
    RedisClient,
} from "@focalors/onebot-protocol";

import { logger } from "./logger";

@injectable()
export class Program implements AsyncService {
    constructor(
        @inject(OnebotWechatToken) private wechat: OnebotWechat,
        @injectAll(OnebotClientToken) private clients: OnebotClient[],
        @inject(RedisClient) private redis: RedisClient
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
        await this.redis.start();
        this.wechat.subscribe(async (message, target) => {
            for (const client of this.clients) {
                const ret = await client.recv(message, target);
                if (ret) {
                    return;
                }
            }
        });

        this.clients.map((client) => {
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
        ]);
        await this.wechat.stop().catch();
        await this.redis.stop().catch();
    }
}
