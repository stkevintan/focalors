import ws from "ws";
import fs from "fs";
import { EventEmitter } from "events";
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { Wechat } from "@focalors/wechat-bridge";

import { inject, injectable } from "tsyringe";
import { randomInt, randomUUID } from "crypto";

import { AsyncService, Protocol } from "./types";
import { Configuration } from "./config";
import { Defer } from "./utils/defer";
import { logger } from "./logger";
import path from "path";
import { FileBox } from "file-box";
import { BotStatus } from "./types/comwechat";

const interval = 30 * 60 * 1000;

@injectable()
export class YunzaiClient implements AsyncService {
    private client?: ws;
    private eventSub = new EventEmitter();

    private self: BotStatus["self"] = {
        platform: "wechat",
        user_id: "me",
    };

    constructor(@inject(Configuration) private configuration: Configuration) {}

    on<K extends Protocol.KnownActionType>(
        eventName: K,
        handler: Protocol.KnownActionMap[K]["handler"]
    ) {
        const handler2 = this.wrapHandler(eventName, handler);
        this.eventSub.on(eventName, handler2);
        return () => {
            this.eventSub.off(eventName, handler2);
        };
    }

    removeAllEvents<K extends Protocol.KnownActionType>(eventName?: K) {
        this.eventSub.removeAllListeners(eventName);
    }

    async start(): Promise<void> {
        await this.connect();
        setInterval(() => {
            void this.removeImagesHoursAgo();
        }, interval);
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

    private async sendReadySignal(uid: string) {
        this.self.user_id = uid;
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
        if (this.eventSub.listenerCount(req.action) === 0) {
            logger.warn(
                "No handler registered to event:",
                req.action,
                this.eventSub
            );
        } else {
            this.eventSub.emit(req.action, req);
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
        handler: T["handler"]
    ) {
        return async ({
            params,
            echo,
        }: Protocol.ActionReq<Parameters<T["handler"]>[0]>) => {
            try {
                logger.debug(`Starting to execute handler of ${actionType}`);
                const res = await handler(params as never);
                if (res) {
                    await this.rawSend({ echo, data: res });
                }
                logger.debug(
                    `Event handler of ${actionType} executed successfully`
                );
            } catch (err) {
                logger.debug(
                    `Event handler of ${actionType} failed to execute`
                );
                // use logger will cause a problem. not sure why.
                console.error(err);
            }
        };
    }

    protected async removeImagesHoursAgo() {
        const dir = this.configuration.imageCacheDirectory;
        try {
            const images = await fs.promises.readdir(dir);
            logger.debug("starting to remove outdated images");
            const ret = await Promise.allSettled(
                images.map(async (image) => {
                    const extname = path.extname(image);
                    if (extname === ".jpg") {
                        const fullpath = path.resolve(dir, image);
                        const stat = await fs.promises.stat(fullpath);
                        if (Date.now() - stat.atimeMs >= interval) {
                            await fs.promises.unlink(fullpath);
                        }
                    }
                })
            );
            logger.debug(
                `removed ${
                    ret.filter((r) => r.status === "fulfilled").length
                } outdated images`
            );
        } catch (err) {
            logger.debug("clear outdated images failed:", err);
        }
    }

    bridge(wechat: Wechat) {
        this.on("get_version", () => ({
            impl: "ComWechat",
            version: "0.0.8",
            onebot_version: "0.0.8",
        }));

        this.on("get_self_info", () => ({
            user_id: wechat.self.id,
            user_name: wechat.self.name,
            user_displayname: "",
        }));

        this.on("get_status", () => ({
            good: true,
            bots: [
                {
                    online: true,
                    self: this.self,
                },
            ],
        }));
        this.on("get_friend_list", wechat.getFriendList.bind(wechat));
        this.on("get_group_list", wechat.getGroupList.bind(wechat));
        this.on(
            "get_group_member_info",
            wechat.getGroupMemberInfo.bind(wechat)
        );

        this.on("send_message", async (params) => {
            try {
                switch (params.detail_type) {
                    case "private":
                        return await wechat.send(
                            params.message,
                            params.user_id
                        );
                    case "group":
                        return await wechat.send(
                            params.message,
                            params.group_id
                        );
                    default:
                        logger.error(
                            "Unrecognized detail type:",
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (params as any).detail_type
                        );
                        return false;
                }
            } catch (err) {
                logger.error("Error while sending message:", err);
            }
            return false;
        });

        this.on("upload_file", async (file) => {
            const dir = this.configuration.imageCacheDirectory;
            const name = randomUUID();
            const imagePath = path.resolve(dir, `${name}.jpg`);
            const filebox = toFileBox(file, `${name}.jpg`);
            if (filebox) {
                logger.info("successfully write image cache into:", imagePath);
                await filebox.toFile(imagePath, true);
            }

            return {
                file_id: name,
            };
        });
        this.sendReadySignal(wechat.self.id);
    }

    async forward(
        message: Protocol.MessageSegment[],
        from: string | { userId: string; groupId: string }
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
            self: this.self,
            ...(typeof from === "object"
                ? {
                      detail_type: "group",
                      group_id: from.groupId,
                      user_id: from.userId,
                  }
                : { detail_type: "private", user_id: from }),
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

function toFileBox(
    file: Parameters<Protocol.UploadFileAction["handler"]>[0],
    name?: string
) {
    switch (file.type) {
        case "data":
            return FileBox.fromBase64(file.data, name);
        case "path":
            return FileBox.fromFile(file.path, name);
        case "url":
            return FileBox.fromUrl(file.url, { headers: file.headers, name });
    }
}
