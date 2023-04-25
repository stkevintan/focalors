import ws from "ws";
import { inject, injectable, injectAll } from "tsyringe";
import { randomInt, randomUUID } from "crypto";
import { promisify } from "util";
import { TOKENS } from "./tokens";

import { Event, Action, ActionRouteHandler } from "./types";
import { Configuration } from "./config";
import { Defer } from "./utils/defer";

@injectable()
export class YunzaiClient {
    private client?: ws;
    private handlerMap = new Map<string, ActionRouteHandler[]>();
    private idleDefer = new Defer<void>();

    async waitForIdle() {
        await this.idleDefer.promise;
    }

    constructor(
        @inject(Configuration) private configuration: Configuration,
        @injectAll(TOKENS.routes) private handlers: ActionRouteHandler[]
    ) {
        this.register();
    }
    async run() {
        this.client = new ws(this.configuration.ws.endpoint);
        await new Promise((res) => this.client!.once("open", res));
        await this.send({
            id: randomUUID(),
            type: "meta",
            time: Date.now(),
            detail_type: "connect",
            sub_type: "",
            self: {
                platform: "wechat",
                user_id: this.configuration.user.id,
            },
            version: {
                impl: "ComWechat",
                version: "1.2.0",
                onebot_version: "12",
            },
        });
        return this.listen();
    }

    private register() {
        for (const handler of this.handlers) {
            this.route(handler);
        }
    }

    listen() {
        const fn = this.handleIncomingMessage.bind(this);
        this.client?.on("message", fn);
        return () => this.client?.off("message", fn);
    }

    route<T extends ActionRouteHandler>(handler: T): () => void {
        if (!this.handlerMap.has(handler.action)) {
            this.handlerMap.set(handler.action, []);
        }
        const sink = this.handlerMap.get(handler.action)!;
        sink.push(handler);
        return () => {
            const index = sink.indexOf(handler);
            if (index >= 0) {
                sink.splice(index, 1);
            }
            if (sink.length === 0) {
                this.handlerMap.delete(handler.action);
            }
        };
    }

    async send(event: Event | Action[1]): Promise<void> {
        if (this.client) {
            const send = promisify(this.client.send.bind(this.client));
            await send(JSON.stringify(event));
        }
    }

    private async handleIncomingMessage(data: ws.RawData) {
        if (!data) {
            throw new Error("empty message received");
        }
        console.log("received: %s", data);
        const req = JSON.parse(String(data)) as Action[0];
        if (null === req || typeof req !== "object") {
            throw new Error("Unexpected message received");
        }
        if (this.handlerMap.has(req.action)) {
            const handlers = this.handlerMap.get(req.action)!;
            console.log(`find %d handlers`, handlers.length);
            await Promise.all(
                handlers.map(async (handler) => {
                    try {
                        const res = await handler.handle(req);
                        await this.send(res);
                        // idle after first get group list call
                        if (req.action === "get_group_list") {
                            this.idleDefer.resolve();
                        }
                    } catch (err) {
                        if (req.action === "get_group_list") {
                            this.idleDefer.reject(err);
                        }
                        console.error(err);
                    }
                })
            );
        }
    }

    async sendMessageEvent(text: string) {
        await this.send({
            type: "message",
            id: randomUUID(),
            time: Date.now(),
            detail_type: "private",
            sub_type: "",
            message_id: "xxxxxxxxxxxxxxx".replace(
                /x/g,
                () => `${Math.floor(randomInt(10))}`
            ),
            message: [
                {
                    type: "text",
                    data: {
                        text,
                    },
                },
            ],
            alt_message: text,
            self: {
                platform: "wechat",
                user_id: this.configuration.user.id,
            },
            user_id: this.configuration.friends[0].user_id,
        });
    }
}
