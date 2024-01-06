import {
    expandTarget,
    MessageSegment,
    MessageTarget2,
    OnebotClient,
    OnebotWechat,
    OnebotWechatToken,
    TextMessageSegment,
} from "@focalors/onebot-protocol";
import { OpenAI } from "openai";
import { createClient, RedisClientType } from "redis";

import { EventEmitter } from "stream";
import { inject, injectable } from "tsyringe";
import { logger } from "./logger";
import { Configuration } from "./config";
import assert from "assert";

@injectable()
export class GPTClient extends OnebotClient {
    private eventSub = new EventEmitter();
    private openai: OpenAI;
    private redisClient?: RedisClientType;
    constructor(
        @inject(Configuration) protected configuration: Configuration,
        @inject(OnebotWechatToken) protected wechat: OnebotWechat
    ) {
        super(configuration);
        this.eventSub.setMaxListeners(0);
        this.openai = new OpenAI({
            baseURL: `${configuration.endpoint}/openai/deployments/${configuration.deployment}`,
            defaultQuery: { "api-version": configuration.apiVersion },
            defaultHeaders: { "api-key": configuration.apiKey },
            apiKey: configuration.apiKey,
        });
    }

    subscribe(
        callback: (message: MessageSegment[], target: MessageTarget2) => void
    ): void {
        this.eventSub.on(
            "message",
            (params: { message: string; target: MessageTarget2 }) => {
                callback(
                    [
                        {
                            type: "text",
                            data: { text: params.message },
                        },
                    ],
                    params.target
                );
            }
        );
    }

    private send(message: string, target: MessageTarget2) {
        if (message) {
            this.eventSub.emit("message", { message, target });
        }
    }

    async receive(
        message: MessageSegment[],
        from: MessageTarget2
    ): Promise<boolean> {
        const { userId, groupId } = expandTarget(from);

        if (userId === this.configuration.masterId) {
            const ret = matchPattern(message, /^!\s*(add|del|list)(.*)$/);
            if (ret?.[0]) {
                logger.debug("Processing admin command:", ret[0]);
                const cacheKey = `admin.gpt.list`;
                assert(this.redisClient, "No redis client available");
                const verb = ret[1];
                const key = ret?.[2]?.trim();
                switch (verb) {
                    case "list": {
                        const groups = await this.wechat.getGroups(false);
                        const friends = await this.wechat.getFriends(false);
                        const users = [
                            ...groups.map((g) => ({
                                id: g.group_id,
                                name: g.group_name,
                            })),
                            ...friends.map((f) => ({
                                id: f.user_id,
                                name: f.user_name,
                            })),
                        ].filter(
                            (c) =>
                                !key ||
                                c.name.includes(key) ||
                                c.id.includes(key)
                        );
                        this.send(
                            `Users & Groups:\n${users
                                .map(
                                    (u, index) =>
                                        `${index + 1}.${
                                            this.configuration.allowIdentities.has(
                                                u.id
                                            )
                                                ? "✅"
                                                : " "
                                        }${u.name}`
                                )
                                .join("\n")}`,
                            from
                        );
                        await this.redisClient.set(
                            cacheKey,
                            JSON.stringify(users),
                            {
                                EX: 10 * 60,
                            }
                        );
                        return true;
                    }
                    case "del":
                    case "add": {
                        const index = parseInt(key, 10);
                        if (index < 1) {
                            this.send(`Invalid index ${index}`, from);
                            return true;
                        }
                        const resp = await this.redisClient.get(cacheKey);
                        if (!resp) {
                            this.send(
                                "Context lost, please re-list contacts",
                                from
                            );
                            return true;
                        }
                        const users = JSON.parse(resp);
                        if (index > users.length || index < 1) {
                            this.send(
                                `Index ${index} is out of users range: [${1}, ${
                                    users.length
                                }]`,
                                from
                            );
                            return true;
                        }
                        const user = users[index - 1];
                        this.configuration[`${verb}Identity`](user.id);
                        await this.configuration.syncToDisk();
                        this.send("Done", from);
                        return true;
                    }
                    default:
                        logger.warn("Unrecognized command:", ret[0]);
                        return false;
                }
            }
        }
        // in group chat
        if (groupId) {
            if (!this.configuration.allowIdentities.has(groupId)) {
                return false;
            }
            // if no one at me or reply me
            if (
                !message.some(
                    (m) =>
                        (m.type === "mention" || m.type === "reply") &&
                        m.data.user_id === this.wechat.self.id
                )
            ) {
                return false;
            }
            // in personal chat
        } else if (!this.configuration.allowIdentities.has(userId!)) {
            return false;
        }

        const segments = message.filter(
            (m): m is TextMessageSegment => m.type === "text"
        );
        const messages = segments.map((s) => s.data.text).filter((t) => !!t);
        if (messages.length === 0) {
            logger.warn(`No text message, skip...`);
            return false;
        }
        try {
            const completion = await this.openai.chat.completions.create({
                messages: messages.map((m) => ({ role: "user", content: m })),
                model: this.configuration.deployment ?? "",
            });
            // for await (const part of completion) {
            //     const text = part.choices[0]?.delta?.content ?? "";
            //     this.send({ message: text, target: from });
            // }
            this.send(completion.choices[0]?.message.content ?? "", from);
        } catch (err) {
            logger.error(err);
            return false;
        }
        return true;
    }
    async start(): Promise<void> {
        assert(this.configuration.apiKey, "OPENAI_APIKEY is empty");
        this.redisClient = createClient({
            url: this.configuration.redisUri,
        });
        await this.redisClient.connect();
    }
    async stop(): Promise<void> {
        await this.configuration.syncToDisk();
    }
}

function matchPattern(message: MessageSegment[], pattern: RegExp) {
    const first = message.find(
        (m): m is TextMessageSegment => m.type === "text"
    );
    return first?.data.text.match(pattern);
}
