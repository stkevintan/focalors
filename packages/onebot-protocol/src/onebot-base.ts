import EventEmitter from "events";
import { InjectionToken } from "tsyringe";
import { AsyncService } from "./common";
import {
    MessageSegment,
    KnownActionMap,
    UploadFileAction,
    FriendInfo,
    GroupInfo,
} from "./comwechat";

export type MessageTarget2 = string | { groupId: string; userId?: string };

export type AbstractActionMap = Omit<
    KnownActionMap,
    "get_status" | "send_message" | "get_version"
>;

export abstract class OnebotClient implements AsyncService {
    private eventSub = new EventEmitter();
    constructor() {
        this.eventSub.setMaxListeners(0);
    }
    abstract start(): Promise<void>;

    abstract stop(): Promise<void>;
    subscribe(
        callback: (message: MessageSegment[], target: MessageTarget2) => void
    ): void {
        this.eventSub.on(
            "message",
            (params: { message: MessageSegment[]; target: MessageTarget2 }) => {
                callback(params.message, params.target);
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

    abstract recv(
        message: MessageSegment[],
        from: MessageTarget2
    ): Promise<boolean>;
}

export const OnebotClientToken: InjectionToken<OnebotClient> = "onebot_client";

export interface OnebotWechat extends AsyncService {
    readonly self: { id: string; name: string };
    send(message: MessageSegment[], to: MessageTarget2): Promise<boolean>;
    subscribe(
        callback: (message: MessageSegment[], target: MessageTarget2) => void
    ): void;

    getFriends(withAvatar?: boolean): Promise<FriendInfo[]>;
    getGroups(withAvatar?: boolean): Promise<GroupInfo[]>;
    getFriend(
        userId: string,
        groupId?: string,
        withAvatar?: boolean
    ): Promise<FriendInfo>;
    cacheFile(file: UploadFileAction["req"]): Promise<string>;
    downloadImage(msgId: string): Promise<string>;
}

export const OnebotWechatToken: InjectionToken<OnebotWechat> = "onebot_wechat";

export function expandTarget(
    target: MessageTarget2
):
    | { groupId: string; userId?: string }
    | { groupId: undefined; userId: string } {
    return typeof target === "string"
        ? { groupId: undefined, userId: target }
        : target;
}
