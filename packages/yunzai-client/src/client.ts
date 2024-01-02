import ws from "ws";
import { EventEmitter } from "events";

import { inject, injectable } from "tsyringe";
import { randomInt, randomUUID } from "crypto";

import { AsyncService, Protocol } from "./types";
import { Configuration } from "./config";
import { Defer } from "./utils/defer";
import { logger } from "./logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Callback = (...args: any[]) => void;
@injectable()
export class YunzaiClient implements AsyncService {
    private client?: ws;
    private eventSub: Record<string, Set<Callback>> = {};

    constructor(@inject(Configuration) private configuration: Configuration) {}

    on<K extends Protocol.KnownActionType>(
        eventName: K,
        handle: Protocol.KnownActionMap[K]["handle"]
    ) {
        const handler = this.wrapHandler(eventName, handle);
        this.eventSub[eventName] ??= new Set();
        this.eventSub[eventName].add(handler);
        return () => {
            this.eventSub[eventName]?.delete(handler);
        };
    }

    removeAllEvents<K extends Protocol.KnownActionType>(eventName?: K) {
        if (eventName) {
            delete this.eventSub[eventName];
        } else {
            this.eventSub = {};
        }
    }

    async start(): Promise<void> {
        await this.connect();
        logger.info("yunzai client started");
    }

    private async connect(): Promise<ws> {
        // if connection existed
        if (this.client && this.client.readyState < ws.CLOSING) {
            logger.warn("duplicate call of connect detected.");
            return this.client;
        }
        this.client = new ws(this.configuration.ws.endpoint);
        // bind message
        this.client.on("message", this.onClientMessage.bind(this));
        // wait for websocket opened
        await waitFor(this.client, "open");
        return this.client;
    }

    async stop() {
        if (this.client && this.client.readyState < ws.CLOSING) {
            this.client.close();
        }
        this.client = undefined;
    }

    private async ping() {
        await this.rawSend({
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

    async sendReadySignal(uid: string) {
        await this.ping();
        await this.rawSend({
            id: randomUUID(),
            type: "meta",
            time: Date.now(),
            sub_type: "",
            detail_type: "status_update",
            status: {
                good: true,
                bots: [
                    {
                        online: true,
                        self: {
                            platform: "wechat",
                            user_id: uid,
                        },
                    },
                ],
            },
        });
    }

    private onClientMessage(data: ws.RawData) {
        if (!data) {
            logger.warn("empty message received, stop processing");
            return;
        }
        const req = JSON.parse(
            data.toString("utf8")
        ) as Protocol.ActionReq<unknown>;
        if (null === req || typeof req !== "object") {
            logger.warn("Unexpected message received", req);
        }
        logger.debug("Received client message:", dontOutputBase64(req));
        const set = this.eventSub[req.action];
        if (!set) {
            logger.warn(
                "No handle registered to event:",
                req.action,
                this.eventSub
            );
        } else {
            this.eventSub[req.action].forEach((handle) => handle(req));
        }
    }

    private async rawSend(
        event: Protocol.Event | Protocol.ActionRes<unknown>
    ): Promise<void> {
        if (this.client) {
            const defer = new Defer<void>();
            this.client.send(JSON.stringify(event), (err: unknown) =>
                err ? defer.reject(err) : defer.resolve()
            );
            await defer.promise;
        } else {
            logger.warn("Event failed to send due to client is not init");
        }
    }

    private wrapHandler<T extends Protocol.KnownAction>(
        actionType: T["name"],
        handle: T["handle"]
    ) {
        return async ({
            params,
            echo,
        }: Protocol.ActionReq<Parameters<T["handle"]>[0]>) => {
            try {
                logger.debug(`Starting to execute handler of ${actionType}`);
                const res = await handle(params as never);
                if (res) {
                    await this.rawSend({ echo, data: res });
                }
                logger.debug(
                    `Event handler of ${actionType} executed successfully`
                );
            } catch (err) {
                logger.debug(
                    `Event handler of ${actionType} failed to execute:`,
                    err
                );
            }
        };
    }

    async send(
        message: Protocol.MessageSegment[],
        from: string,
        to: string | { userId: string; groupId: string }
    ) {
        // try to reconnect if client readystate is close or closing
        if (!this.client || this.client.readyState > ws.OPEN) {
            await this.connect();
        }
        await this.rawSend({
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

async function waitFor<T = unknown>(
    host: EventEmitter,
    event: string
): Promise<T[]> {
    const defer = new Defer<T[]>();
    host.once(event, (...args: T[]) => defer.resolve(args));
    return await defer.promise;
}

function dontOutputBase64(req: Protocol.ActionReq<unknown>) {
    if (req.action === "upload_file") {
        return {
            ...req,
            params: {
                ...(<Protocol.UplaodFileParam>req.params),
                data: "<base64>",
            },
        };
    }
    return req;
}
