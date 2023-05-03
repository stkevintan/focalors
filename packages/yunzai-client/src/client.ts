import ws from "ws";
import { inject, injectable, injectAll } from "tsyringe";
import { randomInt, randomUUID } from "crypto";
import { promisify } from "util";

import { TOKENS } from "./tokens";
import { Protocol } from "./types";
import { Configuration } from "./config";
import { Defer } from "./utils/defer";
import { logger } from "./logger";
import { MessageSegment } from "./types/comwechat";

@injectable()
export class YunzaiClient {
    private client?: ws;
    private _send?: (arg1: any) => Promise<void>;
    private started = false;
    private handlerMap = new Map<string, Protocol.ActionRouteHandler[]>();
    private idleDefer = new Defer<void>();

    constructor(
        @inject(Configuration) private configuration: Configuration,
        @injectAll(TOKENS.routes)
        private handlers: Protocol.ActionRouteHandler[]
    ) {
        this.register();
    }
    async run(): Promise<void> {
        if (this.started) {
            return await this.idleDefer.promise;
        }
        this.started = true;
        this.client = new ws(this.configuration.ws.endpoint);
        await this.listen(this.client);
        await new Promise((res) => this.client?.once("open", res));
        await this.ping();
        setTimeout(() => {
            this.started = false;
            this.idleDefer.reject(
                new Error(
                    `Timeout for idle state after ${this.configuration.ws.idleTimeout}ms`
                )
            );
        }, this.configuration.ws.idleTimeout);
        await this.idleDefer.promise;
    }

    private register() {
        for (const handler of this.handlers) {
            this.route(handler);
        }
    }

    private async ping() {
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
    }

    private async listen(client: ws) {
        // bind messages
        const messageHandler = this.handleIncomingMessage.bind(this);
        client.on("message", messageHandler);
        return () => client.off("message", messageHandler);
    }

    route<T extends Protocol.ActionRouteHandler>(handler: T): () => void {
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

    async send(
        event: Protocol.Event | Protocol.ActionRes<unknown>
    ): Promise<void> {
        if (this.client) {
            const send =
                this._send ||
                (this._send = promisify(this.client.send.bind(this.client)));
            await send(JSON.stringify(event));
        }
    }

    private async handleIncomingMessage(data: ws.RawData) {
        if (!data) {
            throw new Error("empty message received");
        }
        logger.trace(`received raw data: ${data}`);
        const req = JSON.parse(String(data)) as Protocol.KnownAction[0];
        if (null === req || typeof req !== "object") {
            throw new Error("Unexpected message received");
        }
        if (req.action !== "upload_file") {
            logger.info(`incoming request:`, req);
        } else {
            logger.info(`incoming request:`, {
                action: req.action,
                params: { ...req.params, data: "<native>" },
            });
        }
        if (this.handlerMap.has(req.action)) {
            const handlers = this.handlerMap.get(req.action)!;
            logger.debug(`find ${handlers.length} handlers`);
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
                        logger.error(err);
                    }
                })
            );
        }
    }

    async sendMessageEvent(
        message: Protocol.MessageSegment[],
        to: string,
        kind: "group" | "private" = "private"
    ) {
        await this.send({
            type: "message",
            id: randomUUID(),
            time: Date.now(),
            sub_type: "",
            message_id: "xxxxxxxxxxxxxxx".replace(
                /x/g,
                () => `${Math.floor(randomInt(10))}`
            ),
            message,
            alt_message: message.map(alt).join(" "),
            self: {
                platform: "wechat",
                user_id: this.configuration.user.id,
            },
            ...(kind === "group"
                ? { detail_type: "group", group_id: to }
                : { detail_type: "private", user_id: to }),
        });
    }
}

function alt(message: MessageSegment) {
    switch (message.type) {
        case "text":
            return message.data.text;
        case "reply":
            return `<reply ${message.data.message_id}>`;
        case "image":
            return "<image>";
        case "mention":
            return `<metion ${message.data.user_id}>`;
        case "wx.emoji":
            return `<emoji>`;
        default:
            return `<unknown message>`;
    }
}
