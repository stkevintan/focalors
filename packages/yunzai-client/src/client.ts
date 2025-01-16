import ws from "ws";
import { EventEmitter } from "events";
import { inject, injectable } from "tsyringe";
import { randomInt, randomUUID } from "crypto";

import {
    OnebotClient,
    Event,
    ActionRes,
    Action,
    KnownAction,
    ActionReq,
    KnownActionMap,
    PromiseOrNot,
    MessageSegment,
    OnebotWechat,
    TextMessageSegment,
    OnebotWechatToken,
    MessageTarget2,
    MessageTarget,
    UploadFileAction,
    BotStatus,
} from "@focalors/onebot-protocol";
import { Configuration } from "./config";
import { createLogger } from "@focalors/logger";
import { inspect } from "util";

const logger = createLogger("yunzai-client");

@injectable()
export class YunzaiClient extends OnebotClient {
    readonly self: BotStatus["self"] = {
        platform: "wechat",
        user_id: "gpt",
    };

    private client?: ws;
    constructor(
        @inject(Configuration) protected configuration: Configuration,
        @inject(OnebotWechatToken) wechat: OnebotWechat
    ) {
        super(wechat);
    }

    private actionHandlers: {
        [K in keyof KnownActionMap]?: (
            params: KnownActionMap[K]["req"]
        ) => PromiseOrNot<KnownActionMap[K]["res"]>;
    } = {
        get_version: () => ({
            impl: "ComWechat",
            version: "0.0.8",
            onebot_version: "12",
        }),
        get_status: () => ({
            good: true,
            bots: [{ online: true, self: this.self }],
        }),
        upload_file: async (file) => {
            const id = await this.wechat.uploadFile(file);
            return {
                file_id: id,
            };
        },
        get_self_info: () => ({
            user_id: this.wechat.self.id,
            user_name: this.wechat.self.name,
            user_displayname: "",
        }),

        get_friend_list: () => this.wechat.getFriends(),

        get_group_list: () => this.wechat.getGroups(),
        get_group_member_info: (params) =>
            this.wechat.getFriend(params.user_id, params.group_id),
        get_group_member_list: async ({ group_id }) => {
            const rec = await this.wechat.getGroupMembers(group_id);
            return Object.entries(rec).map(([userId, userName]) => ({
                user_id: userId,
                user_name: userName,
                user_displayname: userName,
            }));
        },
        send_message: (params) => {
            this.send(
                params.message,
                params.detail_type === "group"
                    ? {
                          groupId: params.group_id,
                          userId: params.user_id,
                      }
                    : params.user_id
            );
            return true;
        },
    };

    override async start(): Promise<void> {
        await this.connect();
        logger.info("yunzai client started");
    }

    private async connect(): Promise<ws | undefined> {
        // if connection existed
        if (this.client && this.client.readyState < ws.CLOSING) {
            logger.warn("duplicate call of connect detected.");
            return this.client;
        }
        try {
            this.client = new ws(this.configuration.ws.endpoint);
            this.client.on("message", this.onClientMessage.bind(this));
            this.client.on("error", (err) => {
                logger.error(`connection on error: ${inspect(err)}`);
            });
            this.client.on("close", (code, reason) => {
                logger.info("connection closed: %s, %s", code, reason);
            });
            // wait for websocket opened
            await waitFor(this.client, "open");
            this.ping();
            return this.client;
        } catch (err) {
            logger.error(`failed to connect to ComWechat: ${inspect(err)}`);
            return undefined;
        }
    }

    override async stop() {
        if (this.client && this.client.readyState < ws.CLOSING) {
            this.client.close();
        }
        this.client = undefined;
    }

    private ping() {
        this.rawSend({
            id: randomUUID(),
            type: "meta",
            time: Date.now(),
            detail_type: "connect",
            sub_type: "",
            self: this.self,
            version: {
                impl: "ComWechat",
                version: "1.2.0",
                onebot_version: "12",
            },
        });
        this.rawSend({
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
                        self: this.self,
                    },
                ],
            },
        });
    }

    protected async ensureClient() {
        // try to reconnect if client readystate is close or closing
        if (!this.client || this.client.readyState > ws.OPEN) {
            return await this.connect();
        }
        return undefined;
    }

    private async onClientMessage(data: ws.RawData) {
        if (!data) {
            logger.warn("empty message received, stop processing");
            return;
        }
        const req = JSON.parse(data.toString("utf8")) as ActionReq<KnownAction>;
        if (null === req || typeof req !== "object") {
            logger.warn("Unexpected message received", req);
        }
        logger.debug("Received client message: %O", dontOutputBase64(req));
        const handler = this.actionHandlers[req.action];

        if (!handler) {
            logger.warn("No handler registered to event:", req.action);
            return;
        }
        logger.debug(`Starting to execute handler of ${req.action}`);
        try {
            const res = await handler(req.params as never);
            if (res) {
                this.rawSend({ retcode: 0, echo: req.echo, data: res });
            }
            logger.debug(
                `Event handler of ${req.action} executed successfully`
            );
        } catch (err) {
            logger.debug(`Event handler of ${req.action} failed to execute`);
            logger.error(err);
        }
    }

    private rawSend(event: Event | ActionRes<Action>): void {
        if (!this.client || this.client.readyState !== ws.OPEN) {
            logger.error("Cleint: no connection available");
            return;
        }
        this.client.send(JSON.stringify(event), (err: unknown) => {
            if (err) {
                logger.error(`Client send error ${inspect(err)}`);
            }
        });
    }

    override async recv(
        message: MessageSegment[],
        from: MessageTarget2
    ): Promise<boolean> {
        await this.ensureClient();
        const segment = message.find(
            (m): m is TextMessageSegment => m.type === "text"
        );
        if (!segment) {
            logger.warn(`No text message, skip...`);
            return false;
        }

        if (!/(^\s*[#*])|_MHYUUID/.test(segment.data.text)) {
            logger.warn(`Message without prefix # or *, skip...`);
            return false;
        }

        if (segment.data.text.startsWith("#!")) {
            segment.data.text = segment.data.text.substring(2);
        }
        const target: MessageTarget =
            typeof from === "object"
                ? {
                      detail_type: "group",
                      group_id: from.groupId,
                      user_id: from.userId,
                  }
                : { detail_type: "private", user_id: from };

        this.rawSend({
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
            ...target,
        });
        return true;
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

async function waitFor<T = unknown>(
    host: EventEmitter,
    event: string
): Promise<T[]> {
    return await new Promise<T[]>((res) =>
        host.once(event, (...args: T[]) => res(args))
    );
}

function dontOutputBase64(req: ActionReq<Action>) {
    if (req.action === "upload_file") {
        return {
            ...req,
            params: {
                ...(<UploadFileAction["req"]>req.params),
                data: "<base64>",
            },
        };
    }
    return req;
}
