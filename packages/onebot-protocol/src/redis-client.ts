import { createClient, RedisClientType, SetOptions } from "redis";
import { Configuration } from "./config";
import { inject, singleton } from "tsyringe";
import { AsyncService } from "./common";
import assert from "assert";

@singleton()
export class RedisClient implements AsyncService {
    async expire(
        key: string,
        ts: number,
        mode?: "NX" | "XX" | "GT" | "LT" | undefined
    ) {
        return this.client.expire(key, ts, mode);
    }

    async exists(key: string) {
        return this.client.exists(key);
    }

    async del(key: string) {
        return await this.client.del(key);
    }

    async slice(key: string, from: number, to: number) {
        return await this.client.lRange(key, from, to);
    }

    async unshift(key: string, value: unknown) {
        return await this.client.lPush(key, JSON.stringify(value));
    }

    async lTrim(key: string, from: number, to: number) {
        return await this.client.lTrim(key, from, to);
    }

    async sEntries(key: string) {
        const members = await this.client.sMembers(key);
        return new Set(members.map((m) => JSON.parse(m)));
    }

    async sAdd(key: string, ...values: unknown[]) {
        return await this.client.sAdd(
            key,
            values.map((value) => JSON.stringify(value))
        );
    }

    async sRem(key: string, ...values: unknown[]) {
        return await this.client.sRem(
            key,
            values.map((value) => JSON.stringify(value))
        );
    }

    async sIn(key: string, value: unknown) {
        return await this.client.sIsMember(key, JSON.stringify(value));
    }

    private client: RedisClientType;
    constructor(@inject(Configuration) private configuration: Configuration) {
        assert(this.configuration.redisUri, "redisURI is empty");
        this.client = createClient({
            url: this.configuration.redisUri,
        });
    }
    async start(): Promise<void> {
        await this.client.connect();
    }
    async stop(): Promise<void> {
        await this.client.disconnect();
    }

    async set(key: string, value: unknown, options?: SetOptions) {
        this.client.set(key, JSON.stringify(value), options);
    }

    async get<T>(key: string): Promise<T | undefined> {
        const v = await this.client.get(key);
        return v ? JSON.parse(v) : undefined;
    }
}
