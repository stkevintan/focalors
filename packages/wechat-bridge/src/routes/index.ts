import { GetStatusRouteHandler } from "./getStatus";
import { GetSelfInfoRouteHandler } from "./getSelfInfo";
import { GetFriendListRouteHandler } from "./getFriendList";
import { GetGroupListRouteHandler } from "./getGroupList";
import { UploadFileRouteHandler } from "./uploadFile";
import { SendMessageRouteHandler } from "./sendMessage";

export const handlers = [
    GetStatusRouteHandler,
    GetSelfInfoRouteHandler,
    GetFriendListRouteHandler,
    GetGroupListRouteHandler,
    UploadFileRouteHandler,
    SendMessageRouteHandler,
];
