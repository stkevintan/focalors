import { GetStatusRouteHandler } from "./getStatus";
import { container } from "tsyringe";
import { TOKENS } from "../tokens";
import { GetSelfInfoRouteHandler } from "./getSelfInfo";
import { GetFriendListRouteHandler } from "./getFriendList";
import { GetGroupListRouteHandler } from "./getGroupList";

[
    GetSelfInfoRouteHandler,
    GetStatusRouteHandler,
    GetFriendListRouteHandler,
    GetGroupListRouteHandler,
].map((handler) => {
    container.register<any>(TOKENS.routes, { useClass: handler });
});
