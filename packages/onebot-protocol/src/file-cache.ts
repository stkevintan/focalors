import { randomUUID } from "crypto";
import { inject, injectable } from "tsyringe";
import { type UploadFileAction } from "./comwechat";
import { RedisClient } from "./redis-client";

@injectable()
export class FileCache {
    constructor(@inject(RedisClient) protected redis: RedisClient) {}
    async cache(file: UploadFileAction["req"]): Promise<string> {
        const id = file.name ?? randomUUID();
        const key = createRedisFileKey(id);
        if (await this.redis.exists(key)) {
            await this.redis.expire(key, 20 * 60);
            return id;
        }

        await this.redis.set(key, file, {
            EX: 20 * 60,
        });

        return id;
    }

    async get(id: string): Promise<UploadFileAction["req"] | undefined> {
        const key = createRedisFileKey(id);
        return await this.redis.get<UploadFileAction["req"]>(key);
    }

    async addMessageLink(msgId: string, fileId: string) {
        const msgKey = createRedisMessageKey(msgId);
        const fileKey = createRedisFileKey(fileId);
        if (await this.redis.exists(fileKey)) {
            // keep 1 hour
            await this.redis.expire(fileKey, 1 * 60 * 60);
            await this.redis.set(msgKey, fileId, { EX: 1 * 60 * 60 });
            return true;
        }
        return false;
    }

    async getByMessage(
        msgId: string
    ): Promise<UploadFileAction["req"] | undefined> {
        const msgKey = createRedisMessageKey(msgId);
        const fileKey = await this.redis.get<string>(msgKey);
        if (!fileKey) {
            return undefined;
        }
        return await this.get(fileKey);
    }
}

function createRedisMessageKey(id: string) {
    return `wechat:cache:message:${id}`;
}

function createRedisFileKey(id: string) {
    return `wechat:cache:file:${id}`;
}
