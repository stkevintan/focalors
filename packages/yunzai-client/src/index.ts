import { YunzaiClient } from "./client";
import "reflect-metadata";
import { container } from "tsyringe";

export { container, YunzaiClient };

export async function runClient() {
    const client = container.resolve(YunzaiClient);
    await client.run();
    return client;
}

export * from "./tokens";
export * from "./types";
export * from "./config";
export * from "./logger";
