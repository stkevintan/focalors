import { inject, InjectionToken } from "tsyringe";
import { Configuration, YunzaiClient } from "@focalors/yunzai-client";
import path from "path";
import { Protocol, PromiseOrNot } from "@focalors/yunzai-client";

export abstract class Wechat {
    constructor(
        @inject(Configuration) protected configuration: Configuration
    ) {}

    abstract get self(): { id: string; name: string };

    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;

    /** bridge wechat messages to yunzai */
    abstract bridge(client: YunzaiClient): void;

    abstract getFriendList(
        params: Protocol.ActionParam<Protocol.GetFriendListAction>
    ): PromiseOrNot<Protocol.ActionReturn<Protocol.GetFriendListAction>>;

    abstract getGroupList(
        params: Protocol.ActionParam<Protocol.GetGroupListAction>
    ): PromiseOrNot<Protocol.ActionReturn<Protocol.GetGroupListAction>>;

    abstract getGroupMemberInfo(
        params: Protocol.ActionParam<Protocol.GetGroupMemberInfoAction>
    ): PromiseOrNot<Protocol.ActionReturn<Protocol.GetGroupMemberInfoAction>>;

    abstract send(
        message: Protocol.MessageSegment[],
        to: string | { groupId: string; userId?: string }
    ): Promise<boolean>;

    protected loadFileFromId(id: string): string {
        const imagePath = path.resolve(
            this.configuration.imageCacheDirectory,
            `${id}.jpg`
        );
        return imagePath;
    }
}

export const WechatToken: InjectionToken<Wechat> = "wechat";
