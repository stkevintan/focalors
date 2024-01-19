import { inject, injectable, injectWithTransform } from "tsyringe";
import { Configuration } from "./config";
import { matchPattern, MessageSegment } from "./comwechat";
import { RedisClient } from "./redis-client";
import { OnebotWechat, OnebotWechatToken } from "./onebot-base";
import assert from "assert";
import { Transform } from "tsyringe/dist/typings/types";

export interface AccessManager {
    manage(
        message: MessageSegment[],
        userId: string | undefined
    ): Promise<string | null>;

    check(id: string): Promise<boolean>;
}

@injectable()
class AccessManagerImpl implements AccessManager {
    topic: string = "general";
    constructor(
        @inject(Configuration) private configuration: Configuration,
        @inject(RedisClient) private redis: RedisClient,
        @inject(OnebotWechatToken) private wechat: OnebotWechat
    ) {}

    private getStorageKey(subject: "list" | "allowed") {
        return subject === "list"
            ? `admin:access:${subject}`
            : `admin:access:${this.topic}:${subject}`;
    }

    async manage(
        message: MessageSegment[],
        userId: string | undefined
    ): Promise<string | null> {
        if (userId !== this.configuration.masterId) {
            return null;
        }
        const ret = matchPattern(
            message,
            new RegExp(
                `^\\/\\s*(add|del|list)\\s+${escapeRegExp(
                    this.topic
                )}(\\s+.*)?$`
            )
        );
        if (!ret?.[0]) {
            return null;
        }

        // logger.debug("Processing admin command:", ret[0]);
        const verb = ret[1];
        const key = ret?.[2]?.trim();
        return await this.execute(verb, key);
    }

    private async execute(verb: string, key?: string): Promise<string> {
        const cacheKey = this.getStorageKey("list");
        const allowedKey = this.getStorageKey("allowed");
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
                    (c) => !key || c.name.includes(key) || c.id.includes(key)
                );
                await this.redis.set(cacheKey, users, { EX: 10 * 60 });
                // get allowed users:
                const allowed = await this.redis.sEntries(allowedKey);

                return `Users & Groups:\n${users
                    .map(
                        (u, index) =>
                            `${index + 1}.${allowed.has(u.id) ? "✅" : " "}${
                                u.name
                            }`
                    )
                    .join("\n")}`;
            }
            case "del":
            case "add": {
                if (!key) {
                    return `${verb} need index(s)`;
                }
                const users = await this.redis.get<
                    Array<{ id: string; name: string }>
                >(cacheKey);
                if (!users) {
                    return "Context lost, please re-list contacts";
                }
                const idxArr = key
                    .split(",")
                    .map((str) => Number.parseInt(str.trim(), 10))
                    .filter((idx) => idx > 0 && idx <= users.length);
                const userIds = users
                    .filter((u, index) => idxArr.includes(index + 1))
                    .map((u) => u.id);
                this.redis[verb === "add" ? "sAdd" : "sRem"](
                    allowedKey,
                    ...userIds
                );
                return this.execute("list");
            }
            default:
                // logger.warn("Unrecognized command:", ret[0]);
                assert(false, "impossible");
        }
    }
    async check(id: string): Promise<boolean> {
        if (id === this.configuration.masterId) {
            return true;
        }
        const key = this.getStorageKey("allowed");
        return await this.redis.sIn(key, id);
    }
}

function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class AccessManagerTransformer
    implements Transform<AccessManagerImpl, AccessManager>
{
    public transform(m: AccessManagerImpl, topic: string) {
        m.topic = topic;
        return m;
    }
}

export const injectAccessManager = (topic: string) =>
    injectWithTransform(AccessManagerImpl, AccessManagerTransformer, topic);
