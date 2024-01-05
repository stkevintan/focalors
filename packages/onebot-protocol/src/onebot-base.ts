import fs from "fs";
import { InjectionToken } from "tsyringe";
import {
    MessageSegment,
    BotStatus,
    KnownActionMap,
    UploadFileAction,
    FriendInfo,
    GroupInfo,
} from "./comwechat";
import { AsyncService } from "./common";
import path from "path";
import { FileBox } from "file-box";
import { Configuration } from "./config";
import { logger } from "./logger";

export type MessageTarget2 = string | { groupId: string; userId?: string };

export type AbstractActionMap = Omit<
    KnownActionMap,
    "get_status" | "send_message" | "get_version"
>;

const interval = 30 * 60 * 1000;

export abstract class OnebotClient implements AsyncService {
    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
    protected cacheDir: string;

    constructor(configuration: Configuration) {
        this.self = {
            platform: "wechat",
            user_id: configuration.botId,
        };
        this.cacheDir = path.join(
            configuration.imageCacheDirectory,
            configuration.botId
        );
    }
    protected setupAutoCleanTask() {
        try {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        } catch {
            // ..
        }
        setInterval(() => {
            void removeUploadedFiles(this.cacheDir);
        }, interval);
    }

    readonly self: BotStatus["self"];

    abstract subscribe(
        callback: (message: MessageSegment[], target: MessageTarget2) => void
    ): void;

    abstract receive(
        message: MessageSegment[],
        from: MessageTarget2
    ): Promise<boolean>;
}

export const OnebotClientToken: InjectionToken<OnebotClient> = "onebot_client";

export abstract class OnebotWechat implements AsyncService {
    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
    abstract readonly self: { id: string; name: string };
    abstract send(
        message: MessageSegment[],
        to: MessageTarget2
    ): Promise<boolean>;
    abstract subscribe(
        callback: (message: MessageSegment[], target: MessageTarget2) => void
    ): void;

    abstract getFriends(): Promise<FriendInfo[]>;
    abstract getGroups(): Promise<GroupInfo[]>;
    abstract getFriend(userId: string, groupId?: string): Promise<FriendInfo>;
}

export const OnebotWechatToken: InjectionToken<OnebotWechat> = "onebot_wechat";

export function toFileBox(file: UploadFileAction["req"], name?: string) {
    switch (file.type) {
        case "data":
            return FileBox.fromBase64(file.data, name);
        case "path":
            return FileBox.fromFile(file.path, name);
        case "url":
            return FileBox.fromUrl(file.url, { headers: file.headers, name });
    }
}

async function removeUploadedFiles(dir: string) {
    try {
        const images = await fs.promises.readdir(dir);
        logger.debug("starting to remove outdated files");
        const ret = await Promise.allSettled(
            images.map(async (image) => {
                const fullpath = path.resolve(dir, image);
                const stat = await fs.promises.stat(fullpath);
                if (Date.now() - stat.atimeMs >= interval) {
                    await fs.promises.unlink(fullpath);
                }
            })
        );
        logger.debug(
            `removed ${
                ret.filter((r) => r.status === "fulfilled").length
            } outdated files`
        );
    } catch (err) {
        logger.debug("clear outdated files failed:", err);
    }
}
