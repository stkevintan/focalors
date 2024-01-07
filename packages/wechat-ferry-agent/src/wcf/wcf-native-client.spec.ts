import "reflect-metadata";
import { container } from "tsyringe";
import { WcfNativeClient } from "./wcf-native-client";

describe("wcf native client", () => {
    let client: WcfNativeClient;
    beforeEach(async () => {
        client = container.resolve(WcfNativeClient);
        await client.start();
    });

    afterEach(async () => {
        await client.stop();
    });

    it("should get is_login message", async () => {
        console.log("client state", client.state);
        expect(Object.values(client.state)).toStrictEqual([1]);
        await expect(client.isLogin()).resolves.toBeDefined();
    });
});
