import { Configuration, PromiseOrNot, Protocol } from "@focalors/yunzai-client";
import { inject, injectable } from "tsyringe";

@injectable()
export class GetSelfInfoRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.GetSelfInfoAction>
{
    constructor(@inject(Configuration) private configuration: Configuration) {}
    readonly action = "get_self_info";
    handle(
        req: Protocol.GetSelfInfoAction[0]
    ): PromiseOrNot<Protocol.GetSelfInfoAction[1]> {
        return {
            echo: req.echo,
            data: {
                user_id: this.configuration.user.id,
                user_name: this.configuration.user.name,
                user_displayname: this.configuration.user.displayName,
            },
        };
    }
}
