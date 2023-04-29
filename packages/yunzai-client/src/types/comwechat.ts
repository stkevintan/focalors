import { PromiseOrNot } from "./common";

// event
export interface MessageEvent {
    id: string; // uuidv4
    type: "message";
    time: number; // 1682160211.0
    detail_type: "group" | "private";
    sub_type: "";
    self: {
        platform: "wechat";
        // wxid_
        user_id: string;
    };
    // 741404476633614146
    message_id: string;
    message: MessageSegment[];
    alt_message: string;
    user_id: string;
}

export interface MetaEvent {
    id: string;
    type: "meta";
    time: number;
    sub_type: "";
    detail_type: "connect";
    self: {
        platform: "wechat";
        user_id: string;
    };
    version: {
        impl: "ComWechat";
        version: "1.2.0";
        onebot_version: "12";
    };
}

export interface MessageSegment {
    type: "text" | "wx.emoji" | "reply" | "image" | "metion";
    data?: any;
}

export type Event = MetaEvent | MessageEvent;

// actions
export interface ActionReq<Action extends string, Param extends {} = {}> {
    action: Action;
    echo: string;
    params?: Param;
}
export interface ActionRes<Data> {
    echo: string;
    data: Data;
}

export type ActionCreator<
    Req extends ActionReq<string>,
    Res extends ActionRes<{}>
> = [req: Req, res: Res];

export interface BotStatus {
    online: boolean;
    self: {
        platform: "wechat";
        user_id: string;
    };
}

export type GetStatusAction = ActionCreator<
    ActionReq<"get_status">,
    ActionRes<{ good: boolean; bots: BotStatus[] }>
>;

export type GetSelfInfoAction = ActionCreator<
    ActionReq<"get_self_info">,
    ActionRes<{ user_id: string; user_name: string; user_displayname: string }>
>;

// https://justundertaker.github.io/ComWeChatBotClient/action/private.html#%E8%8E%B7%E5%8F%96%E5%A5%BD%E5%8F%8B%E5%88%97%E8%A1%A8
export type GetFriendListAction = ActionCreator<
    ActionReq<"get_friend_list">,
    ActionRes<FriendInfo[]>
>;
export interface FriendInfo {
    user_id: string;
    user_name: string;
    user_displayname: string;
    user_remark: string;
    "wx.verify_flag": "0" | "1";
}

// https://justundertaker.github.io/ComWeChatBotClient/action/group.html#%E8%8E%B7%E5%8F%96%E7%BE%A4%E5%88%97%E8%A1%A8
export type GetGroupListAction = ActionCreator<
    ActionReq<"get_group_list">,
    ActionRes<GroupInfo[]>
>;
export interface GroupInfo {
    group_id: string;
    group_name: string;
}

// https://justundertaker.github.io/ComWeChatBotClient/action/file.html#%E4%B8%8A%E4%BC%A0%E6%96%87%E4%BB%B6
export type UploadFileAction = ActionCreator<
    ActionReq<"upload_file", UploadFileAction>,
    ActionRes<{ file_id: string }>
>;

export interface UplaodFileParam {
    type: "data";
    // base64
    data: string;
    name: string;
}

export type Action =
    | GetStatusAction
    | GetSelfInfoAction
    | GetFriendListAction
    | GetGroupListAction
    | UploadFileAction;

export interface ActionRouteHandler<T extends Action = Action> {
    action: T[0]["action"];
    handle: (req: T[0]) => PromiseOrNot<T[1]>;
}
