import {
    AsyncService,
    MessageSegment,
    OnebotWechat,
    OnebotWechatToken,
} from "@focalors/onebot-protocol";
import assert from "assert";
import { createClient, RedisClientType } from "redis";
import { inject, singleton } from "tsyringe";
import { Configuration } from "./config";
import { logger } from "./logger";
import { matchPattern } from "./utils";

@singleton()
export class AccessManager implements AsyncService {
    private client?: RedisClientType;

    get redisClient(): RedisClientType  {
        assert(this.client, `Redis client has not started or stopped`);
        return this.client;
    }

    constructor(
        @inject(Configuration) private configuration: Configuration,
        @inject(OnebotWechatToken) private wechat: OnebotWechat
    ) {}

    private stopped = false;
    async start(): Promise<void> {
        assert(this.configuration.redisUri, "redisUri is empty");
        this.client = createClient({
            url: this.configuration.redisUri,
        });
        await this.client.connect();
    }

    async stop(): Promise<void> {
        if (this.stopped) {
            return;
        }
        this.stopped = true;
        await this.configuration.syncToDisk();
        await this.client?.disconnect();
    }

    async manage(
        message: MessageSegment[],
        userId: string | undefined
    ): Promise<string | null> {
        if (userId !== this.configuration.masterId) {
            return null;
        }
        const ret = matchPattern(message, /^\/\s*(add|del|list)(.*)$/);
        if (!ret?.[0]) {
            return null;
        }

        logger.debug("Processing admin command:", ret[0]);
        const cacheKey = `gpt:admin:list`;
        assert(this.client, "No redis client available");
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
                    (c) => !key || c.name.includes(key) || c.id.includes(key)
                );
                await this.client.set(cacheKey, JSON.stringify(users), {
                    EX: 10 * 60,
                });
                return `Users & Groups:\n${users
                    .map(
                        (u, index) =>
                            `${index + 1}.${
                                this.configuration.allowIdentities.has(u.id)
                                    ? "✅"
                                    : " "
                            }${u.name}`
                    )
                    .join("\n")}`;
            }
            case "del":
            case "add": {
                const index = parseInt(key, 10);
                if (index < 1) {
                    return `Invalid index ${index}`;
                }
                const resp = await this.client.get(cacheKey);
                if (!resp) {
                    return "Context lost, please re-list contacts";
                }
                const users = JSON.parse(resp);
                if (index > users.length || index < 1) {
                    return `Index ${index} is out of users range: [${1}, ${
                        users.length
                    }]`;
                }
                const user = users[index - 1];
                this.configuration[`${verb}Identity`](user.id);
                await this.configuration.syncToDisk();
                return `Done`;
            }
            default:
                logger.warn("Unrecognized command:", ret[0]);
                return null;
        }
    }

    check(
        { userId, groupId }: { userId?: string; groupId?: string },
    ) {
        // in group chat
        if (groupId) {
            if (!this.configuration.allowIdentities.has(groupId)) {
                logger.debug(`group ${groupId} is not allowed, skip...`);
                return false;
            }
            // in personal chat
        } else if (!this.configuration.allowIdentities.has(userId!)) {
            logger.debug(`user ${userId} is not allowed, skip...`);
            return false;
        }
        return true;
    }
}