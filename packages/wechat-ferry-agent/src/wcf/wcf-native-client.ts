import { AsyncService } from "@focalors/onebot-protocol";
import { Socket } from "@focalors/wcf-native";
import { inject, singleton } from "tsyringe";
import { WcfConfiguration } from "../config";
import { logger } from "../logger";
import { wcf } from "./proto-generated/wcf";
import * as rd from "./proto-generated/roomdata";

@singleton()
export class WcfNativeClient implements AsyncService {
    readonly NotFriend = {
        fmessage: "朋友推荐消息",
        medianote: "语音记事本",
        floatbottle: "漂流瓶",
        filehelper: "文件传输助手",
        newsapp: "新闻",
    };
    private msgSocket?: Socket;
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

    private sendRequest(req: wcf.Request): wcf.Response {
        const data = req.serialize();
        const buf = this.socket.send(Buffer.from(data));
        const res = wcf.Response.deserialize(buf);
        return res;
    }

    /** 是否已经登录 */
    isLogin(): boolean {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_IS_LOGIN,
            // empty: new wcf.Empty()
        });
        const rsp = this.sendRequest(req);
        return rsp.status == 1;
    }

    /**获取登录账号wxid */
    getSelfWxid(): string {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_SELF_WXID,
        });
        const rsp = this.sendRequest(req);
        return rsp.str;
    }

    /** 获取登录账号个人信息 */
    getUserInfo(): wcf.UserInfo {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_USER_INFO,
        });
        const rsp = this.sendRequest(req);
        return rsp.ui;
    }

    /** 获取完整通讯录 */
    getContacts(): wcf.RpcContact[] {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_CONTACTS,
        });
        const rsp = this.sendRequest(req);
        return rsp.contacts.contacts;
    }

    /** 通过 wxid 查询微信号昵称等信息 */
    getContact(wxid: string): wcf.RpcContact {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_CONTACT_INFO,
            str: wxid,
        });
        const rsp = this.sendRequest(req);
        return rsp.contacts.contacts[0];
    }

    /** 获取所有数据库 */
    getDbNames(): string[] {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_DB_NAMES,
        });
        const rsp = this.sendRequest(req);
        return rsp.dbs.names;
    }

    /** 获取数据库中所有表 */
    getDbTables(db: string): wcf.DbTable[] {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_DB_TABLES,
            str: db,
        });
        const rsp = this.sendRequest(req);
        return rsp.tables.tables;
    }

    /**
     * 执行 SQL 查询，如果数据量大注意分页
     * @param db
     * @param sql
     */
    dbSqlQuery(
        db: string,
        sql: string
    ): Record<string, string | number | Buffer | undefined>[] {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_EXEC_DB_QUERY,
            query: new wcf.DbQuery({ db, sql }),
        });
        const rsp = this.sendRequest(req);
        const rows = rsp.rows.rows;
        return rows.map((r) =>
            Object.fromEntries(
                r.fields.map((f) => [f.column, parseDbField(f.type, f.content)])
            )
        );
    }

    /**
     * 获取消息类型
     * {"47": "石头剪刀布 | 表情图片", "62": "小视频", "43": "视频", "1": "文字", "10002": "撤回消息", "40": "POSSIBLEFRIEND_MSG", "10000": "红包、系统消息", "37": "好友确认", "48": "位置", "42": "名片", "49": "共享实时位置、文件、转账、链接", "3": "图片", "34": "语音", "9999": "SYSNOTICE", "52": "VOIPNOTIFY", "53": "VOIPINVITE", "51": "微信初始化", "50": "VOIPMSG"}
     */
    getMsgTypes(): Map<number, string> {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_MSG_TYPES,
        });
        const rsp = this.sendRequest(req);
        return rsp.types.types;
    }

    /**
     * 刷新朋友圈
     * @param id 开始 id，0 为最新页
     * @returns 1 为成功，其他失败
     */
    refreshPyq(id: number): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_REFRESH_PYQ,
            ui64: id,
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    /** 获取群聊列表 */
    getChatRooms(): wcf.RpcContact[] {
        const contacts = this.getContacts();
        return contacts.filter((c) => c.wxid.endsWith("@chatroom"));
    }

    getFriends() {
        const contacts = this.getContacts();
        return contacts.filter(
            (c) =>
                !c.wxid.endsWith("@chatroom") &&
                !c.wxid.startsWith("gh_") &&
                !Object.hasOwn(this.NotFriend, c.wxid)
        );
    }

    getChatRoomMembers(roomid: string): Record<string, string> {
        const [room] = this.dbSqlQuery(
            "MicroMsg.db",
            `SELECT RoomData FROM ChatRoom WHERE ChatRoomName = '${roomid}';`
        );
        if (!room) {
            return {};
        }
        const r = rd.com.iamteer.wcf.RoomData.deserialize(
            room["RoomData"] as Buffer
        );

        const userRds = this.dbSqlQuery(
            "MicroMsg.db",
            "SELECT UserName, NickName FROM Contact;"
        );

        const userDict = Object.fromEntries(
            userRds.map((u) => [u["UserName"], u["NickName"]] as const)
        );
        return Object.fromEntries(
            r.members.map((member) => [
                member.wxid,
                member.name ?? userDict[member.wxid],
            ])
        );
    }

    /**
     * 获取群成员昵称
     * @param wxid
     * @param roomid
     * @returns
     */
    getAliasInChatRoom(wxid: string, roomid: string): string | undefined {
        const [row] = this.dbSqlQuery(
            "MicroMsg.db",
            `SELECT NickName FROM Contact WHERE UserName = '${wxid}';`
        );
        const nickName = row?.["NickName"];
        if (!nickName) {
            return undefined;
        }
        const [room] = this.dbSqlQuery(
            "MicroMsg.db",
            `SELECT RoomData FROM ChatRoom WHERE ChatRoomName = '${roomid}';`
        );
        if (!room) {
            return undefined;
        }
        const roomData = rd.com.iamteer.wcf.RoomData.deserialize(
            room["RoomData"] as Buffer
        );
        return roomData.members.find((m) => m.wxid === wxid)?.name;
    }

    /**
     * 邀请群成员
     * @param roomid
     * @param wxids
     * @returns int32 1 为成功，其他失败
     */
    inviteChatroomMembers(roomid: string, wxids: string[]): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_INV_ROOM_MEMBERS,
            m: new wcf.MemberMgmt({
                roomid,
                wxids: wxids.join(",").replaceAll(" ", ""),
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    /**
     * 添加群成员
     * @param roomid
     * @param wxids
     * @returns int32 1 为成功，其他失败
     */
    addChatRoomMembers(roomid: string, wxids: string[]): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_ADD_ROOM_MEMBERS,
            m: new wcf.MemberMgmt({
                roomid,
                wxids: wxids.join(",").replaceAll(" ", ""),
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    /**
     * 删除群成员
     * @param roomid
     * @param wxids
     * @returns int32 1 为成功，其他失败
     */
    delChatRoomMembers(roomid: string, wxids: string[]): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_DEL_ROOM_MEMBERS,
            m: new wcf.MemberMgmt({
                roomid,
                wxids: wxids.join(",").replaceAll(" ", ""),
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    /**
     * 撤回消息
     * @param msgid (uint64): 消息 id
     * @returns int: 1 为成功，其他失败
     */
    revokeMsg(msgid: number): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_REVOKE_MSG,
            ui64: msgid,
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    /**
     * 转发消息
     * @param msgid (uint64): 消息 id
     * @param receiver string 消息接收人，wxid 或者 roomid
     * @returns int: 1 为成功，其他失败
     */
    forwardMsg(msgid: number, receiver: string): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_FORWARD_MSG,
            fm: new wcf.ForwardMsg({
                id: msgid,
                receiver,
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    /**
     * 发送文本消息
     * @param msg 要发送的消息，换行使用 `\n` （单杠）；如果 @ 人的话，需要带上跟 `aters` 里数量相同的 @
     * @param receiver 消息接收人，wxid 或者 roomid
     * @param aters 要 @ 的 wxid，多个用逗号分隔；`@所有人` 只需要 `notify@all`
     * @returns 0 为成功，其他失败
     */
    sendTxt(msg: string, receiver: string, aters: string): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_SEND_TXT,
            txt: new wcf.TextMsg({
                msg,
                receiver,
                aters,
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    sendImage(path: string, receiver: string): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_SEND_IMG,
            file: new wcf.PathMsg({
                path,
                receiver,
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    sendFile(path: string, receiver: string): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_SEND_FILE,
            file: new wcf.PathMsg({
                path,
                receiver,
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    sendXML(
        xml: { content: string; path?: string; type: number },
        receiver: string
    ): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_SEND_XML,
            xml: new wcf.XmlMsg({
                receiver,
                content: xml.content,
                type: xml.type,
                path: xml.path,
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    sendEmotion(path: string, receiver: string): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_SEND_EMOTION,
            file: new wcf.PathMsg({
                path,
                receiver,
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    sendRichText(
        desc: {
            name?: string;
            account?: string;
            title?: string;
            digest?: string;
            url?: string;
            thumburl?: string;
        },
        receiver: string
    ): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_SEND_RICH_TXT,
            rt: new wcf.RichText({
                ...desc,
                receiver,
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    sendPat(roomid: string, wxid: string): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_SEND_PAT_MSG,
            pm: new wcf.PatMsg({
                roomid,
                wxid,
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    async getAudioMsg(msgid: number, dir: string, times = 3): Promise<string> {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_GET_AUDIO_MSG,
            am: new wcf.AudioMsg({
                id: msgid,
                dir,
            }),
        });
        const rsp = this.sendRequest(req);
        if (rsp.str) {
            return rsp.str;
        }
        if (times > 0) {
            await sleep();
            return this.getAudioMsg(msgid, dir, times - 1);
        }
        throw new Error("Timeout: get audio msg");
    }

    async getOCRResult(extra: string, times = 2): Promise<string> {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_EXEC_OCR,
            str: extra,
        });
        const rsp = this.sendRequest(req);
        if (rsp.ocr.status === 0 && rsp.ocr.result) {
            return rsp.ocr.result;
        }

        if (times > 0) {
            await sleep();
            return this.getOCRResult(extra, times - 1);
        }
        throw new Error("Timeout: get ocr result");
    }

    downloadAttach(msgid: number, thumb?: string, extra?: string): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_DOWNLOAD_ATTACH,
            att: new wcf.AttachMsg({
                id: msgid,
                thumb,
                extra,
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    decryptImage(src: string, dir: string): string {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_DECRYPT_IMAGE,
            dec: new wcf.DecPath({
                src,
                dst: dir,
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.str;
    }

    async downloadImage(
        msgid: number,
        extra: string,
        dir: string,
        times = 30
    ): Promise<string> {
        if (this.downloadAttach(msgid, undefined, extra) !== 0) {
            return Promise.reject("Failed to download attach");
        }
        for (let cnt = 0; cnt < times; cnt++) {
            const path = this.decryptImage(extra, dir);
            if (path) {
                return path;
            }
            sleep();
        }
        return Promise.reject("Failed to decrypt image");
    }

    acceptNewFriend(v3: string, v4: string, scene = 30): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_ACCEPT_FRIEND,
            v: new wcf.Verification({
                v3,
                v4,
                scene,
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    receiveTransfer(
        wxid: string,
        transferid: string,
        transactionid: string
    ): number {
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_RECV_TRANSFER,
            tf: new wcf.Transfer({
                wxid,
                tfid: transferid,
                taid: transactionid,
            }),
        });
        const rsp = this.sendRequest(req);
        return rsp.status;
    }

    enableMsgReciver(pyq = false): boolean {
        if (this.msgSocket) {
            return true;
        }
        const req = new wcf.Request({
            func: wcf.Functions.FUNC_ENABLE_RECV_TXT,
            flag: pyq,
        });
        const rsp = this.sendRequest(req);
        if (rsp.status !== 0) {
            this.msgSocket = undefined;
            return false;
        }
        try {
            this.msgSocket = this.connectToMsgChannel();

            return true;
        } catch (err) {
            logger.error(err);
            this.msgSocket = undefined;
            return false;
        }
    }

    private connectToMsgChannel() {
        const client = new Socket();
        client.connect(this.getConnUrl(true));
        return client;
    }
}
function uint8Array2str(arr: Uint8Array) {
    return Buffer.from(arr).toString();
}

function parseDbField(type: number, content: Uint8Array) {
    // self._SQL_TYPES = {1: int, 2: float, 3: lambda x: x.decode("utf-8"), 4: bytes, 5: lambda x: None}
    switch (type) {
        case 1:
            return Number.parseInt(uint8Array2str(content), 10);
        case 2:
            return Number.parseFloat(uint8Array2str(content));
        case 3:
        default:
            return uint8Array2str(content);
        case 4:
            return Buffer.from(content);
        case 5:
            return undefined;
    }
}
function sleep(ms = 1000) {
    return new Promise<void>((res) => setTimeout(() => res(), ms));
}
