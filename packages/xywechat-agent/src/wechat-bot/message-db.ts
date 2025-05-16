import { createLogger } from "@focalors/logger";
import Sqlite from "better-sqlite3";
import { inject, singleton } from "tsyringe";
import { XYWechatConfiguration } from "../config";
import type { MessageType } from "./message-parser";

const logger = createLogger("xywechat-agent:MessageDB");
export interface PersistableMessage {
    MsgId: string;
    SenderWxid: string;
    FromWxid: string;
    MsgType: MessageType;
    Content: string;
    Data?: Buffer;
    IsGroup?: boolean;
}

@singleton()
export class MessageDB {
    private db: Sqlite.Database;

    constructor(
        @inject(XYWechatConfiguration) private config: XYWechatConfiguration
    ) {
        this.db = Sqlite(`${this.config.databaseFolder}/message.db`, {});
        this.db.pragma("journal_mode = WAL");
        this.initTable();
    }

    initTable() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS message (
                MsgId TEXT PRIMARY KEY,
                SenderWxid TEXT,
                FromWxid TEXT,
                MsgType INTEGER,
                Content TEXT,
                Data BLOB,
                IsGroup BOOLEAN`);
    }

    save(message: PersistableMessage): boolean {
        try {
            const stmt = this.db.prepare(`
            INSERT INTO message (MsgId, SenderWxid, FromWxid, MsgType, Content, Data, IsGroup)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
            stmt.run(
                message.MsgId,
                message.SenderWxid,
                message.FromWxid,
                message.MsgType,
                message.Content,
                message.Data,
                message.IsGroup
            );
            return true;
        } catch (e) {
            logger.error("Failed to save message", e);
            return false;
        }
    }

    get(MsgId: string): PersistableMessage | undefined {
        const stmt = this.db.prepare(`
            SELECT * FROM message WHERE MsgId = ?
        `);
        return stmt.get(MsgId) as PersistableMessage | undefined;
    }
}
