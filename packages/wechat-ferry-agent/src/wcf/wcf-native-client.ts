import { AsyncService } from "@focalors/onebot-protocol";
import { Socket } from "@focalors/wcf-native";
import { inject, singleton } from "tsyringe";
import { WcfConfiguration } from "../config";
import { logger } from "../logger";
import { wcf } from "./proto/wcf";

@singleton()
export class WcfNativeClient implements AsyncService {
    private socket: Socket;
    constructor(
        @inject(WcfConfiguration) private configuration: WcfConfiguration
    ) {
        this.socket = new Socket();
    }

    get connected() {
        return this.socket.connected();
    }

    getConnUrl(rev = false) {
        const url = `tcp://${this.configuration.wcfProto.host}:${
            this.configuration.wcfProto.port + (rev ? 1 : 0)
        }`;
        logger.info("wcf native url:", url);
        return url;
    }
    async start(): Promise<void> {
        try {
            this.socket.connect(this.getConnUrl());
        } catch (err) {
            logger.error("cannot connect to wcf RPC server");
            throw err;
        }
    }

    async stop(): Promise<void> {
        this.socket.close();
    }

    private async sendRequest(req: wcf.Request) {
        const data = req.serialize();
        const buf = this.socket.send(Buffer.from(data));
        const res = wcf.Response.deserialize(buf);
        return res;
    }

    /** 是否已经登录 */
    async isLogin(): Promise<boolean> {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_IS_LOGIN,
            // empty: new wcf.Empty()
        });
        const rsp = await this.sendRequest(req);
        return rsp.status == 1;
    }

    /**获取登录账号wxid */
    async getSelfWxid(): Promise<string> {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_SELF_WXID,
        });
        const rsp = await this.sendRequest(req);
        return rsp.str;
    }

    /** 获取登录账号个人信息 */
    async getUserInfo(): Promise<wcf.UserInfo> {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_USER_INFO,
        });
        const rsp = await this.sendRequest(req);
        return rsp.ui;
    }

    /** 获取完整通讯录 */
    async getContacts(): Promise<wcf.RpcContact[]> {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_CONTACTS,
        });
        const rsp = await this.sendRequest(req);
        return rsp.contacts.contacts;
    }

    /** 通过 wxid 查询微信号昵称等信息 */
    async getContact(wxid: string): Promise<wcf.RpcContact> {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_CONTACT_INFO,
            str: wxid,
        });
        const rsp = await this.sendRequest(req);
        return rsp.contacts.contacts[0];
    }

    /** 获取所有数据库 */
    async getDbNames(): Promise<string[]> {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_DB_NAMES,
        });
        const rsp = await this.sendRequest(req);
        return rsp.dbs.names;
    }

    /** 获取数据库中所有表 */
    async getDbTables(db: string): Promise<wcf.DbTable[]> {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_DB_TABLES,
            str: db,
        });
        const rsp = await this.sendRequest(req);
        return rsp.tables.tables;
    }

    /**
     * 执行 SQL 查询，如果数据量大注意分页
     * @param db
     * @param sql
     */
    async dbSqlQuery(db: string, sql: string): Promise<wcf.DbRow[]> {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_EXEC_DB_QUERY,
            query: new wcf.DbQuery({ db, sql }),
        });
        const rsp = await this.sendRequest(req);
        return rsp.rows.rows;
    }

    /** 获取所有消息类型 */
    async getMsgTypes(): Promise<Map<number, string>> {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_MSG_TYPES,
        });
        const rsp = await this.sendRequest(req);
        return rsp.types.types;
    }

    /**
     * 刷新朋友圈
     * @param id 开始 id，0 为最新页
     * @returns 1 为成功，其他失败
     */
    async refreshPyq(id: number): Promise<number> {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_REFRESH_PYQ,
            ui64: id,
        });
        const rsp = await this.sendRequest(req);
        return rsp.status;
    }

    /** 获取群聊列表 */
    async getChatrooms(): Promise<wcf.RpcContact[]> {
        const contacts = await this.getContacts();
        return contacts.filter((c) => c.wxid.endsWith("@chatroom"));
    }

    async getChatRoomMembers(roomId: string): Promise<Record<string, string>> {
        const userRds = await this.dbSqlQuery(
            "MicroMsg.db",
            "SELECT UserName, NickName FROM Contact;"
        );
        const userDict = Object.fromEntries(
            userRds.map(
                (u) =>
                    [
                        uint8Array2str(u.fields[0].content),
                        uint8Array2str(u.fields[1].content),
                    ] as const
            )
        );
        const roomDatas = this.dbSqlQuery(
            "MicroMsg.db",
            `SELECT RoomData FROM ChatRoom WHERE ChatRoomName = '${roomId}';`
        );
        if (!roomDatas) {
            return {};
        }
        //TODO: parse roomData
        return userDict
    }
}
function uint8Array2str(arr: Uint8Array) {
    return Buffer.from(arr).toString();
}
