import { createLogger } from "@focalors/logger";
import EventEmitter from "events";
import { inject, InjectionToken } from "tsyringe";
import { inspect } from "util";
import { AsyncService } from "./common";
import {
    MessageSegment,
    KnownActionMap,
    UploadFileAction,
    FriendInfo,
    GroupInfo,
    MessageTarget,
} from "./comwechat";

// export type MessageTarget2 = string | { groupId: string; userId?: string };

export class MessageTarget2 {
    readonly groupId?: string;
    readonly userId?: string;

    static fromMessageTarget(target: MessageTarget): MessageTarget2 {
        if (target.detail_type === "group") {
            return new MessageTarget2({
                groupId: target.group_id,
                userId: target.user_id,
            });
        }
        if (target.detail_type === "private") {
            return new MessageTarget2(target.user_id);
        }
        throw new Error("Invalid message target");
    }
    
    constructor(id: string | { groupId?: string; userId?: string }) {
        if (typeof id === "string") {
            this.userId = id;
        } else {
            this.groupId = id.groupId;
            this.userId = id.userId;
        }
    }

    isGroup(): this is { groupId: string; userId?: string } {
        return !!this.groupId;
    }

    isPrivate(): this is { groupId: undefined; userId: string } {
        return !this.groupId;
    }

    toMessageTarget(): MessageTarget {
        if (this.isGroup()) {
            return {
                detail_type: "group",
                group_id: this.groupId,
                user_id: this.userId,
            };
        }
        if (this.isPrivate()) {
            return {
                detail_type: "private",
                user_id: this.userId,
            };
        }
        throw new Error("Invalid message target");
    }
}

export type AbstractActionMap = Omit<
    KnownActionMap,
    "get_status" | "send_message" | "get_version"
>;

export const OnebotWechatToken: InjectionToken<OnebotWechat> = "onebot_wechat";
export const OnebotClientToken: InjectionToken<OnebotClient> = "onebot_client";

const logger = createLogger("onebot-client");
export abstract class OnebotClient implements AsyncService {
    private eventSub = new EventEmitter();
    constructor(@inject(OnebotWechatToken) protected wechat: OnebotWechat) {
        this.eventSub.setMaxListeners(0);
    }

    async start(): Promise<void> {}

    async stop(): Promise<void> {}

    subscribe(
        callback: (message: MessageSegment[], target: MessageTarget2) => void
    ): void {
        this.eventSub.on(
            "message",
            (params: { message: MessageSegment[]; target: MessageTarget2 }) => {
                Promise.resolve()
                    .then(() => callback(params.message, params.target))
                    .catch((err) => {
                        logger.error(
                            `Failed to execute callback: ${inspect(err)}`
                        );
                        return null;
                    });
            }
        );
    }

    protected send(message: MessageSegment[], target: MessageTarget2) {
        this.eventSub.emit("message", { message, target });
    }

    protected sendText(text: string, target: MessageTarget2) {
        if (text) {
            this.send(
                [
                    {
                        type: "text",
                        data: { text },
                    },
                ],
                target
            );
        }
    }

    protected async sendFile(
        params: Parameters<OnebotWechat["uploadFile"]>[0],
        target: MessageTarget2,
        type: "image" | "file" | "wx.emoji" = "image"
    ) {
        const id = await this.wechat.uploadFile(params);
        this.send(
            [
                {
                    type,
                    data: { file_id: id },
                },
            ],
            target
        );
    }

    abstract recv(
        message: MessageSegment[],
        from: MessageTarget2
    ): Promise<boolean>;
}

export interface OnebotWechat extends AsyncService {
    readonly self: { id: string; name: string };
    send(message: MessageSegment[], to: MessageTarget2): Promise<boolean>;
    subscribe(
        callback: (message: MessageSegment[], target: MessageTarget2) => void
    ): void;

    getFriends(withAvatar?: boolean): Promise<FriendInfo[]>;
    getGroups(withAvatar?: boolean): Promise<GroupInfo[]>;
    getGroupMembers(roomId: string): Promise<Record<string, string>>;
    getFriend(
        userId: string,
        groupId?: string,
        withAvatar?: boolean
    ): Promise<FriendInfo>;
    uploadFile(file: UploadFileAction["req"]): Promise<string>;
    /**
     * download image as data url
     * @param msgId message id
     */
    downloadImage(msgId: string): Promise<string>;
}

// export function expandTarget(
//     target: MessageTarget
// ):
//     | { groupId: string; userId?: string }
//     | { groupId: undefined; userId: string } {
//     return typeof target === "string"
//         ? { groupId: undefined, userId: target }
//         : target;
// }
