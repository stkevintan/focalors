import { injectable } from "tsyringe";
import type { MessageType } from "./message-parser";

export interface PersistableMessage {
    MsgId: string;
    SenderWxid: string;
    FromWxid: string;
    MsgType: MessageType;
    Content: string;
    IsGroup?: boolean;
}

@injectable()
export class MessageDB {
    private messages: PersistableMessage[] = [];

    async save(message: PersistableMessage): Promise<boolean> {
        this.messages.push(message);
        return true;
    }

    getMessages(): any[] {
        return this.messages;
    }
}
