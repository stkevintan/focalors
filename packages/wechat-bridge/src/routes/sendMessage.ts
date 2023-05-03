import { Configuration, Protocol, PromiseOrNot } from "@focalors/yunzai-client";

import { inject, singleton } from "tsyringe";

@singleton()
export class SendMessageRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.SendMessageAction>
{
    constructor(@inject(Configuration) private configuration: Configuration) {}
    readonly action = "send_message";
    handle(
        req: Protocol.SendMessageAction[0]
    ): PromiseOrNot<Protocol.SendMessageAction[1]> {
        // TODO: send message to user
        return {
            echo: req.echo,
            data: true,
        };
    }
}
