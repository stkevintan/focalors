import "reflect-metadata";
import { container } from "tsyringe";
import "./routes";
import { YunzaiClient } from "./client";

async function main() {
    const client = container.resolve(YunzaiClient);
    await client.run();
    await client.waitForIdle();
    await client.sendMessageEvent("帮助");
    console.log("setup client ok");
}

main();
