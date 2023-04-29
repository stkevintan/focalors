import { YunzaiClient } from "./client";
import "reflect-metadata";
import { container } from "tsyringe";
import { Constructor, Protocol } from "./types";
import { TOKENS } from "./tokens";

export { container, YunzaiClient };

export async function runClient(
    routeHandlers: Readonly<Constructor<Protocol.ActionRouteHandler<any>>[]> = []
) {
    routeHandlers.map((handler) => container.register(TOKENS.routes, handler));
    const client = container.resolve(YunzaiClient);
    await client.run();
    return client;
}

export * from "./tokens";
export * from "./types";
export * from "./config";
export * from "./logger";
