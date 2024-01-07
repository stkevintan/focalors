import "reflect-metadata";
import { container } from "tsyringe";
import { WcfNativeClient } from "./wcf-native-client";

describe("wcf native client", () => {
    let client: WcfNativeClient;
    beforeEach(async () => {
        client = container.resolve(WcfNativeClient);
        await client.start();
        console.log("client state", client.connected);
        expect(client.connected).toBe(true);
    });

    afterEach(async () => {
        await client.stop();
    });

    it("isLogin", async () => {
        await expect(client.isLogin()).resolves.toBeDefined();
    });

    it("getSelfWxid", async () => {
        await expect(client.getSelfWxid()).resolves.toBeDefined();
    });

    it("getUserInfo", async () => {
        await expect(client.getUserInfo()).resolves.toHaveProperty('wxid');
    });

    it("getContact", async () => {
        await expect(client.getContact('filehelper')).resolves.toHaveProperty("wxid");
    })
});
