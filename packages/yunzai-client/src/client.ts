import ws from "ws";
import { EventEmitter } from "events";

import { inject, injectable, injectAll } from "tsyringe";
import { randomInt, randomUUID } from "crypto";

import { TOKENS } from "./tokens";
import { Protocol } from "./types";
import { Configuration } from "./config";
import { Defer } from "./utils/defer";
import { logger } from "./logger";

// TODO: use other EventEmitter implement with type support
@injectable()
export class YunzaiClient extends EventEmitter {
    private client?: ws;

    constructor(
        @inject(Configuration) private configuration: Configuration,
        @injectAll(TOKENS.routes)
        handlers: Protocol.ActionRouteHandler[]
    ) {
        super({
            captureRejections: true,
        });
        this.setMaxListeners(handlers.length * 2);
        for (const handler of handlers) {
            this.on(handler.action, this.wrapHandler(handler));
        }
    }

    async start(): Promise<void> {
        await this.connect();
    }

    private async connect(): Promise<ws> {
        // // if connection existed
        if (this.client && this.client.readyState < ws.CLOSING) {
            logger.warn("duplicate call of connect detected.");
            return this.client;
        }
        this.client = new ws(this.configuration.ws.endpoint);
        // bridge message to event
        this.onMessage(this.client);
        // wait for websocket opened
        await this.once$("open");
        await Promise.all([
            this.ping(),
            this.once$("get_group_list"),
            this.once$("get_friend_list"),
        ]);
        return this.client;
    }

    async once$<T = unknown>(event: string): Promise<T[]> {
        const defer = new Defer<T[]>();
        this.once(event, (...args: T[]) => defer.resolve(args));
        return await defer.promise;
    }

    stop() {
        if (this.client && this.client.readyState < ws.CLOSING) {
            this.client.close();
        }
        this.client = undefined;
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
                user_id: "",
            },
            version: {
                impl: "ComWechat",
                version: "1.2.0",
                onebot_version: "12",
            },
        });
    }

    private onMessage(client: ws) {
        client.on("message", (data) => {
            if (!data) {
                logger.warn("empty message received, stop processing");
                return;
            }
            const req = JSON.parse(String(data)) as Protocol.KnownAction[0];
            if (null === req || typeof req !== "object") {
                logger.warn("Unexpected message received", req);
            }
            this.emit(req.action, req);
        });
    }

    async send(
        event: Protocol.Event | Protocol.ActionRes<unknown>
    ): Promise<void> {
        if (this.client) {
            const defer = new Defer<void>();
            this.client.send(JSON.stringify(event), (err) =>
                err ? defer.reject(err) : defer.resolve()
            );
            await defer.promise;
        } else {
            logger.warn("Event failed to send due to client is not init");
        }
    }

    private wrapHandler(handler: Protocol.ActionRouteHandler) {
        return async (req: Protocol.ActionReq<string>) => {
            try {
                logger.debug(`Starting to execute handler of ${req.action}`);
                await handler.handle(req);
                logger.debug(
                    `Event handler of ${req.action} executed successfully`
                );
            } catch (err) {
                logger.error(
                    `Event handler of ${req.action} failed to execute:`,
                    err
                );
            }
        };
    }

    async sendMessageEvent(
        message: Protocol.MessageSegment[],
        from: string,
        to: string | { userId: string; groupId: string }
    ) {
        // try to reconnect if client readystate is close or closing
        if (!this.client || this.client.readyState > ws.OPEN) {
            this.stop();
            await this.connect();
        }
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
                user_id: from,
            },
            ...(typeof to === "object"
                ? {
                      detail_type: "group",
                      group_id: to.groupId,
                      user_id: to.userId,
                  }
                : { detail_type: "private", user_id: to }),
        });
    }
}

function alt(message: Protocol.MessageSegment) {
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
