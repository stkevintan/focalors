import { GetStatusRouteHandler } from "./getStatus";
import { GetSelfInfoRouteHandler } from "./getSelfInfo";
import { GetFriendListRouteHandler } from "./getFriendList";
import { GetGroupListRouteHandler } from "./getGroupList";

import { container, TOKENS } from "@focalors/yunzai-client";

[
    GetSelfInfoRouteHandler,
    GetStatusRouteHandler,
    GetFriendListRouteHandler,
    GetGroupListRouteHandler,
].map((handler) => {
    container.register<any>(TOKENS.routes, { useClass: handler });
});
