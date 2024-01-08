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
});
