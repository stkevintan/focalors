import { TupleToUnion } from "type-fest";

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

export interface MetaConnectEvent {
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

export interface MetaStatusUpdateEvent {
    id: string;
    type: "meta";
    time: number;
    sub_type: "";
    detail_type: "status_update";
    status: GetStatusAction["res"];
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
        user_id: string;
        message_id: string;
        // extra message
        message_content: unknown;
    };
}

export interface CardMessage {
    name?: string;
    account: string;
    title: string;
    digest?: string;
    url: string;
    thumburl: string;
}
/** extended */
export interface CardMessageSegment {
    type: "card";
    data: CardMessage;
}

/** extended */
// export interface WxXMLMessageSegment {
//     type: "wx.xml";
//     data: {
//         content: string;
//         path?: string;
//         type: number;
//     };
// }

export type MessageSegment =
    | TextMessageSegment
    | MentionMessageSegment
    | ImageMessageSegment
    | ReplyMessageSegment
    | WxEmojiMessageSegment
    | CardMessageSegment
    // | WxXMLMessageSegment;

export type Event = MetaConnectEvent | MetaStatusUpdateEvent | MessageEvent;

// actions
// export interface ActionReq<Action extends string, Param = unknown> {
//     action: Action;
//     echo: string;
//     params: Param;
// }

export type ActionReq<T extends Action> = T extends Action<infer K, infer P>
    ? {
          action: K;
          echo: string;
          params: P;
      }
    : never;

export interface ActionRes<R extends Action> {
    echo: string;
    data: R["res"];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Action<K extends string = string, P = any, R = unknown> = {
    name: K;
    req: P;
    res: R;
};

// export interface ActionRes<Data> {
//     echo: string;
//     data: Data;
// }

// export type Action<
//     Req extends ActionReq<string> = ActionReq<string>,
//     Res extends ActionRes<any> = ActionRes<any>
// > = [req: Req, res: Res];

export interface BotStatus {
    online: boolean;
    self: {
        platform: "wechat";
        user_id: string;
    };
}

export type GetStatusAction = Action<
    "get_status",
    void,
    { good: boolean; bots: BotStatus[] }
>;

export type GetSelfInfoAction = Action<
    "get_self_info",
    void,
    { user_id: string; user_name: string; user_displayname: string }
>;

// https://justundertaker.github.io/ComWeChatBotClient/action/private.html#%E8%8E%B7%E5%8F%96%E5%A5%BD%E5%8F%8B%E5%88%97%E8%A1%A8
export type GetFriendListAction = Action<"get_friend_list", void, FriendInfo[]>;
export interface FriendInfo {
    user_id: string;
    user_name: string;
    user_displayname: string;
    user_remark?: string;
    // extension property
    "wx.avatar"?: string;
}

// https://justundertaker.github.io/ComWeChatBotClient/action/group.html#%E8%8E%B7%E5%8F%96%E7%BE%A4%E5%88%97%E8%A1%A8
export type GetGroupListAction = Action<"get_group_list", void, GroupInfo[]>;

export interface GroupInfo {
    group_id: string;
    group_name: string;
    // extension property
    "wx.avatar"?: string;
}

// https://justundertaker.github.io/ComWeChatBotClient/action/file.html#%E4%B8%8A%E4%BC%A0%E6%96%87%E4%BB%B6
export type UploadFileAction = Action<
    "upload_file",
    FileTrait & { name: string; headers?: Record<string, string> },
    { file_id: string }
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
    "send_message",
    MessageTarget & { message: MessageSegment[] },
    boolean
>;

export interface UplaodFileParam {
    type: "data";
    // base64
    data: string;
    name: string;
}

// https://justundertaker.github.io/ComWeChatBotClient/action/group.html#%E8%8E%B7%E5%8F%96%E7%BE%A4%E6%88%90%E5%91%98%E4%BF%A1%E6%81%AF
export type GetGroupMemberInfoAction = Action<
    "get_group_member_info",
    { group_id: string; user_id: string },
    FriendInfo
>;

// https://justundertaker.github.io/ComWeChatBotClient/action/meta.html#%E8%8E%B7%E5%8F%96%E7%89%88%E6%9C%AC%E4%BF%A1%E6%81%AF
export type GetVersionAction = Action<
    "get_version",
    void,
    { impl: "ComWechat"; version: string; onebot_version: string }
>;

export type KnownActions = [
    GetStatusAction,
    GetVersionAction,
    GetSelfInfoAction,
    GetFriendListAction,
    GetGroupListAction,
    GetGroupMemberInfoAction,
    UploadFileAction,
    SendMessageAction
];

export type KnownAction = TupleToUnion<KnownActions>;

type UnionToMap<T extends Action> = {
    [K in T["name"]]: T extends Action<K> ? T : never;
};

export type KnownActionMap = UnionToMap<KnownAction>;
export type Test<T extends Action> = {
    [K in T["name"]]: T extends Action<K, infer R> ? R : never;
};
