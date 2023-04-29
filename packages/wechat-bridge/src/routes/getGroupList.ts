import { Configuration, PromiseOrNot, Protocol } from "@focalors/yunzai-client";
import { inject, injectable } from "tsyringe";

@injectable()
export class GetGroupListRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.GetGroupListAction>
{
    constructor(@inject(Configuration) private configuration: Configuration) {}
    readonly action = "get_group_list";
    handle(
        req: Protocol.GetGroupListAction[0]
    ): PromiseOrNot<Protocol.GetGroupListAction[1]> {
        return {
            echo: req.echo,
            data: this.configuration.groups,
        };
    }
}
