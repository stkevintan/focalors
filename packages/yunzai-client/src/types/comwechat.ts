import { PromiseOrNot } from "./common";

// event

export interface PrivateMessageTarget {
    detail_type: "private";
    user_id: string;
}
export interface GroupMessageTarget {
    detail_type: "group";
    group_id: string;
    user_id?: string;
}
export type MessageTarget = GroupMessageTarget | PrivateMessageTarget;

interface MessageEventBase {
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
}

export type MessageEvent = MessageEventBase & MessageTarget;

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

export interface TextMessageSegment {
    type: "text";
    data: {
        text: string;
    };
}

export interface WxEmojiMessageSegment {
    type: "wx.emoji";
    data: {
        file_id: string;
    };
}

export interface MentionMessageSegment {
    type: "mention";
    data: {
        user_id: string;
    };
}

export interface ImageMessageSegment {
    type: "image";
    data: {
        file_id: string;
    };
}

export interface ReplyMessageSegment {
    type: "reply";
    data: {
        message_id: string;
        user_id: string;
    };
}

export type MessageSegment =
    | TextMessageSegment
    | MentionMessageSegment
    | ImageMessageSegment
    | ReplyMessageSegment
    | WxEmojiMessageSegment;

export type Event = MetaEvent | MessageEvent;

// actions
export interface ActionReq<Action extends string, Param = unknown> {
    action: Action;
    echo: string;
    params: Param;
}

export interface ActionRes<Data> {
    echo: string;
    data: Data;
}

export type Action<
    Req extends ActionReq<string> = ActionReq<string>,
    Res extends ActionRes<any> = ActionRes<any>
> = [req: Req, res: Res];

export interface BotStatus {
    online: boolean;
    self: {
        platform: "wechat";
        user_id: string;
    };
}

export type GetStatusAction = Action<
    ActionReq<"get_status">,
    ActionRes<{ good: boolean; bots: BotStatus[] }>
>;

export type GetSelfInfoAction = Action<
    ActionReq<"get_self_info">,
    ActionRes<{ user_id: string; user_name: string; user_displayname: string }>
>;

// https://justundertaker.github.io/ComWeChatBotClient/action/private.html#%E8%8E%B7%E5%8F%96%E5%A5%BD%E5%8F%8B%E5%88%97%E8%A1%A8
export type GetFriendListAction = Action<
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
export type GetGroupListAction = Action<
    ActionReq<"get_group_list">,
    ActionRes<GroupInfo[]>
>;
export interface GroupInfo {
    group_id: string;
    group_name: string;
}

// https://justundertaker.github.io/ComWeChatBotClient/action/file.html#%E4%B8%8A%E4%BC%A0%E6%96%87%E4%BB%B6
export type UploadFileAction = Action<
    ActionReq<
        "upload_file",
        FileTrait & { name: string; headers?: Record<string, string> }
    >,
    ActionRes<{ file_id: string }>
>;

interface UrlFileTrait {
    type: "url";
    url: string;
}
interface PathFileTrait {
    type: "path";
    path: string;
}

interface DataFileTrait {
    type: "data";
    data: string;
}

type FileTrait = UrlFileTrait | PathFileTrait | DataFileTrait;

// https://justundertaker.github.io/ComWeChatBotClient/action/message.html#%E5%8F%91%E9%80%81%E6%B6%88%E6%81%AF

export type SendMessageAction = Action<
    ActionReq<"send_message", MessageTarget & { message: MessageSegment[] }>,
    ActionRes<boolean>
>;

export interface UplaodFileParam {
    type: "data";
    // base64
    data: string;
    name: string;
}

// https://justundertaker.github.io/ComWeChatBotClient/action/message.html
export type KnownAction =
    | GetStatusAction
    | GetSelfInfoAction
    | GetFriendListAction
    | GetGroupListAction
    | UploadFileAction
    | SendMessageAction;

export interface ActionRouteHandler<T extends Action = Action> {
    action: T[0]["action"];
    handle: (req: T[0]) => PromiseOrNot<T[1]>;
}
