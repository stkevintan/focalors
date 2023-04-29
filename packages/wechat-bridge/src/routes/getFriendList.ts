import { Configuration, Protocol, PromiseOrNot } from "@focalors/yunzai-client";

import { inject, singleton } from "tsyringe";

@singleton()
export class GetFriendListRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.GetFriendListAction>
{
    constructor(@inject(Configuration) private configuration: Configuration) {}
    readonly action = "get_friend_list";
    handle(
        req: Protocol.GetFriendListAction[0]
    ): PromiseOrNot<Protocol.GetFriendListAction[1]> {
        return {
            echo: req.echo,
            data: this.configuration.friends,
        };
    }
}
