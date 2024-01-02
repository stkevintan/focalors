import fs from "fs";
import { inject, InjectionToken } from "tsyringe";
import { YunzaiClient } from "@focalors/yunzai-client";
import { Configuration } from "./config";
import { logger } from "./logger";
import path from "path";
import { Protocol, PromiseOrNot } from "@focalors/yunzai-client";
import { randomUUID } from "crypto";
import { FileBox } from "file-box";
import assert from "assert";

const interval = 30 * 60 * 1000;

export abstract class Wechat {
    constructor(@inject(Configuration) protected configuration: Configuration) {
        this.startFileWatcher();
    }

    protected startFileWatcher() {
        return setInterval(() => {
            void this.removeImagesHoursAgo();
        }, interval);
    }

    abstract get self(): { id: string; name: string };

    protected abstract bot: {
        on: (
            eventName: "message",
            callback: (message: unknown) => void
        ) => void;
    };
    /** bridge wechat message to yunzai */
    protected abstract bridgeForward(
        client: YunzaiClient,
        message: unknown
    ): void;

    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;

    /** DO NOT override this method */
    bridge(client: YunzaiClient): void {
        assert(
            this.self,
            "No current user, please make sure agent has been started"
        );
        this.bot.on("message", (message) =>
            this.bridgeForward(client, message)
        );
        client.on("get_version", this.bridgeGetVersion.bind(this));
        client.on("get_self_info", this.bridgeGetSelfInfo.bind(this));
        client.on("get_status", this.bridgeGetStatus.bind(this));
        client.on("get_friend_list", this.bridgeGetFriendList.bind(this));
        client.on("get_group_list", this.bridgeGetGroupList.bind(this));
        client.on(
            "get_group_member_info",
            this.bridgeGetGroupMemberInfo.bind(this)
        );
        client.on("send_message", this.bridgeSendMessage.bind(this));
        client.on("upload_file", this.bridgeUploadFile.bind(this));
        void client.sendReadySignal(this.self.id);
    }

    protected bridgeGetVersion(): Protocol.ActionReturn<Protocol.GetVersionAction> {
        return {
            impl: "ComWechat",
            version: "0.0.8",
            onebot_version: "0.0.8",
        };
    }

    protected bridgeGetSelfInfo(): Protocol.ActionReturn<Protocol.GetSelfInfoAction> {
        return {
            user_id: this.self.id,
            user_name: this.self.name,
            user_displayname: "",
        };
    }
    protected bridgeGetStatus(): Protocol.ActionReturn<Protocol.GetStatusAction> {
        return {
            good: true,
            bots: [
                {
                    online: true,
                    self: {
                        platform: "wechat",
                        user_id: this.self.id,
                    },
                },
            ],
        };
    }
    protected abstract bridgeGetFriendList(
        params: Protocol.ActionParam<Protocol.GetFriendListAction>
    ): PromiseOrNot<Protocol.ActionReturn<Protocol.GetFriendListAction>>;

    protected abstract bridgeGetGroupList(
        params: Protocol.ActionParam<Protocol.GetGroupListAction>
    ): PromiseOrNot<Protocol.ActionReturn<Protocol.GetGroupListAction>>;

    protected abstract bridgeGetGroupMemberInfo(
        params: Protocol.ActionParam<Protocol.GetGroupMemberInfoAction>
    ): PromiseOrNot<Protocol.ActionReturn<Protocol.GetGroupMemberInfoAction>>;

    protected async bridgeSendMessage(
        params: Protocol.ActionParam<Protocol.SendMessageAction>
    ): Promise<Protocol.ActionReturn<Protocol.SendMessageAction>> {
        try {
            switch (params.detail_type) {
                case "private":
                    return await this.sendMessageToUser(
                        params.message,
                        params.user_id
                    );
                case "group":
                    return await this.sendMessageToGroup(
                        params.message,
                        params.group_id,
                        params.user_id
                    );
                default:
                    logger.error(
                        "Unrecognized detail type:",
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (params as any).detail_type
                    );
                    return false;
            }
        } catch (err) {
            logger.error("Error while sending message:", err);
        }
        return false;
    }

    protected async bridgeUploadFile(
        file: Protocol.ActionParam<Protocol.UploadFileAction>
    ): Promise<Protocol.ActionReturn<Protocol.UploadFileAction>> {
        const dir = this.configuration.imageCacheDirectory;
        const name = randomUUID();
        const imagePath = path.resolve(dir, `${name}.jpg`);
        const filebox = toFileBox(file, `${name}.jpg`);
        if (filebox) {
            logger.info("successfully write image cache into:", imagePath);
            await filebox.toFile(imagePath, true);
        }

        return {
            file_id: name,
        };
    }

    protected abstract sendMessageToUser(
        message: Protocol.MessageSegment[],
        userId: string
    ): Promise<boolean>;

    protected abstract sendMessageToGroup(
        message: Protocol.MessageSegment[],
        groupId: string,
        userId?: string
    ): Promise<boolean>;

    protected async removeImagesHoursAgo() {
        const dir = this.configuration.imageCacheDirectory;
        try {
            const images = await fs.promises.readdir(dir);
            logger.debug("starting to remove outdated images");
            const ret = await Promise.allSettled(
                images.map(async (image) => {
                    const extname = path.extname(image);
                    if (extname === ".jpg") {
                        const fullpath = path.resolve(dir, image);
                        const stat = await fs.promises.stat(fullpath);
                        if (Date.now() - stat.atimeMs >= interval) {
                            await fs.promises.unlink(fullpath);
                        }
                    }
                })
            );
            logger.debug(
                `removed ${
                    ret.filter((r) => r.status === "fulfilled").length
                } outdated images`
            );
        } catch (err) {
            logger.debug("clear outdated images failed:", err);
        }
    }

    protected loadFileFromId(id: string): string {
        const imagePath = path.resolve(
            this.configuration.imageCacheDirectory,
            `${id}.jpg`
        );
        return imagePath;
    }
}

export const WechatToken: InjectionToken<Wechat> = "wechat";

function toFileBox(
    file: Parameters<Protocol.UploadFileAction["handle"]>[0],
    name?: string
) {
    switch (file.type) {
        case "data":
            return FileBox.fromBase64(file.data, name);
        case "path":
            return FileBox.fromFile(file.path, name);
        case "url":
            return FileBox.fromUrl(file.url, { headers: file.headers, name });
    }
}
