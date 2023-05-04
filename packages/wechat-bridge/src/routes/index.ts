import { container } from "tsyringe";

import { Protocol, TOKENS } from "@focalors/yunzai-client";

import { GetStatusRouteHandler } from "./getStatus";
import { GetSelfInfoRouteHandler } from "./getSelfInfo";
import { GetFriendListRouteHandler } from "./getFriendList";
import { GetGroupListRouteHandler } from "./getGroupList";
import { UploadFileRouteHandler } from "./uploadFile";
import { SendMessageRouteHandler } from "./sendMessage";

[
    GetStatusRouteHandler,
    GetSelfInfoRouteHandler,
    GetFriendListRouteHandler,
    GetGroupListRouteHandler,
    UploadFileRouteHandler,
    SendMessageRouteHandler,
].map((handler) =>
    container.register<
        Protocol.ActionRouteHandler<
            Protocol.Action<Protocol.ActionReq<any, any>>
        >
    >(TOKENS.routes, handler)
);
