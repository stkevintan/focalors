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
        client.disableMsgReceiver();
        await client.stop();
    });

    it("isLogin", async () => {
        expect(client.isLogin()).toBeDefined();
    });

    it("getSelfWxid", async () => {
        expect(client.getSelfWxid()).toBeDefined();
    });

    it("getUserInfo", async () => {
        expect(client.getUserInfo()).toHaveProperty("wxid");
    });

    it("getContact", async () => {
        expect(client.getContact("filehelper")).toHaveProperty("wxid");
    });

    it("dbSqlQuery", async () => {
        const ret = client.dbSqlQuery(
            "MicroMsg.db",
            `SELECT UserName From Contact WHERE UserName LIKE "wxid_%" LIMIT 1;`
        );
        expect(ret).toHaveLength(1);

        expect(ret[0]).toHaveProperty("UserName");
        expect(ret[0]["UserName"] as string).toMatch(/wxid_.*/);
    });

    it("getChatRoomMembers(happy path)", async () => {
        const chatrooms = client.getChatRooms();
        const ret = client.getChatRoomMembers(chatrooms[0].wxid);
        expect(Object.keys(ret).length).toBeTruthy();
    });

    it("getChatRoomMembers(bad path)", async () => {
        const ret = client.getChatRoomMembers("not existed");
        expect(Object.keys(ret)).toHaveLength(0);
    });

    it("disableMsgReceiver", async () => {
        expect(client.disableMsgReceiver(true)).toBe(0);
    })
    it.skip(
        "enableMsgReciver",
        async () => {
            let times = 3;
            const handler = new Promise<void>((res) =>
                client.on((msg) => {
                    console.log("get msg", msg);
                    times--;
                    if (times <= 0) {
                        res();
                    }
                })
            );
            client.enableMsgReciver();
            await handler;
        },
        1 * 60 * 1000
    );
});
