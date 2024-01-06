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
    UplaodFileParam,
    OnebotWechat,
    TextMessageSegment,
    toFileBox,
    OnebotWechatToken,
    MessageTarget2,
    SendMessageAction,
    MessageTarget,
} from "@focalors/onebot-protocol";
import { Configuration } from "./config";
import { Defer } from "./utils/defer";
import { logger } from "./logger";
import path from "path";

const hint = `本次深渊杯角色属性预览：\n\n1 : ['火', '草', '火', '雷']\n2 : ['风', '草', '冰', '冰'] \n3 : ['火', '草', '风', '风']\n4 : ['风', '火', '草', '水']\n5 : ['草', '草', '水', '草']`;

@injectable()
export class YunzaiClient extends OnebotClient {
    private client?: ws;
    constructor(
        @inject(Configuration) protected configuration: Configuration,
        @inject(OnebotWechatToken) protected wechat: OnebotWechat
    ) {
        super(configuration);
        this.eventSub.setMaxListeners(0);
    }
    private eventSub = new EventEmitter();

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
            const filename = file.name ?? `${randomUUID()}`;
            const imagePath = path.resolve(this.cacheDir, filename);
            const filebox = toFileBox(file, filename);
            if (filebox) {
                await filebox.toFile(imagePath, true);
            }
            return {
                file_id: imagePath,
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
        send_message: (params) => {
            this.send(params);
            return true;
        },
    };

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
        this.client.on("message", this.onClientMessage.bind(this));
        // wait for websocket opened
        await waitFor(this.client, "open");
        this.ping();
        return this.client;
    }

    async stop() {
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

    private async onClientMessage(data: ws.RawData) {
        if (!data) {
            logger.warn("empty message received, stop processing");
            return;
        }
        const req = JSON.parse(data.toString("utf8")) as ActionReq<KnownAction>;
        if (null === req || typeof req !== "object") {
            logger.warn("Unexpected message received", req);
        }
        logger.debug("Received client message:", dontOutputBase64(req));
        const handler = this.actionHandlers[req.action];

        if (!handler) {
            logger.warn("No handler registered to event:", req.action);
            return;
        }
        logger.debug(`Starting to execute handler of ${req.action}`);
        try {
            const res = await handler(req.params as never);
            if (res) {
                this.rawSend({ echo: req.echo, data: res });
            }
            logger.debug(
                `Event handler of ${req.action} executed successfully`
            );
        } catch (err) {
            logger.debug(`Event handler of ${req.action} failed to execute`);
            // use logger will cause a problem. not sure why.
            console.error(err);
        }
    }

    private rawSend(event: Event | ActionRes<Action>): void {
        if (!this.client) {
            logger.error("Cleint: no connection available");
            return;
        }
        this.client.send(JSON.stringify(event), (err: unknown) => {
            if (err) {
                logger.error("Client send error", err);
            }
        });
    }

    override subscribe(
        callback: (message: MessageSegment[], target: MessageTarget2) => void
    ): void {
        this.eventSub.on("message", (params: SendMessageAction["req"]) => {
            return callback(
                params.message,
                params.detail_type === "group"
                    ? { groupId: params.group_id, userId: params.user_id }
                    : params.user_id
            );
        });
    }

    private send(params: SendMessageAction["req"]) {
        this.eventSub.emit("message", params);
    }

    async receive(
        message: MessageSegment[],
        from: string | { userId: string; groupId: string }
    ) {
        // try to reconnect if client readystate is close or closing
        if (!this.client || this.client.readyState > ws.OPEN) {
            await this.connect();
        }
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
        const target: MessageTarget =
            typeof from === "object"
                ? {
                      detail_type: "group",
                      group_id: from.groupId,
                      user_id: from.userId,
                  }
                : { detail_type: "private", user_id: from };

        if (/^#\s*随机深渊杯\s*$/.test(segment.data.text)) {
            this.send({
                message: [
                    {
                        type: "text",
                        data: {
                            text: "MS Genshin群第三届随机深渊杯活动时间：1月5日20:00 -1月7日23:59，详情请查看公众号：",
                        },
                    },
                    {
                        type: "card",
                        data: {
                            name: "",
                            digest: "",
                            title: "Random Abyss",
                            account: "gh_cabafdd5cf81",
                            thumburl: `http://mmbiz.qpic.cn/sz_mmbiz_png/nMeboN2UZ1ghzh1zzpN3xrYDUiaENePuH9JiaoBLVJhTfYkBh4Z9icBNVYfqS7ylaBEBhJX22nwLZ5yGL0dSDOFxQ/0?wx_fmt=png`,
                            // eslint-disable-next-line no-useless-escape
                            // url: `https://mp.weixin.qq.com/mp/getmasssendmsg?__biz=MzkyMjYyMzY1MA==#wechat_webview_type=1&wechat_redirect","title_key":"__mp_wording__brandinfo_history_massmsg"`
                            url: `https://mp.weixin.qq.com/mp/getmasssendmsg?__biz=MzkyMjYyMzY1MA==#wechat_webview_type=1&wechat_redirect`,
                        },
                    },
                    {
                        type: "text",
                        data: {
                            text: hint,
                        },
                    },
                ],
                ...target,
            });
            return true;
        }

        if (/^#\s*随机深渊杯角色属性\s*$/.test(segment.data.text)) {
            this.send({
                message: [
                    {
                        type: "text",
                        data: {
                            text: hint,
                        },
                    },
                ],
                ...target,
            });
            return true;
        }

        if (segment.data.text.startsWith("#!")) {
            segment.data.text = segment.data.text.substring(2);
        }

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
    const defer = new Defer<T[]>();
    host.once(event, (...args: T[]) => defer.resolve(args));
    return await defer.promise;
}

function dontOutputBase64(req: ActionReq<Action>) {
    if (req.action === "upload_file") {
        return {
            ...req,
            params: {
                ...(<UplaodFileParam>req.params),
                data: "<base64>",
            },
        };
    }
    return req;
}
