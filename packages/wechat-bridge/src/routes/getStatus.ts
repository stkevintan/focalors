import { Protocol, PromiseOrNot, Configuration } from "@focalors/yunzai-client";
import { inject, injectable } from "tsyringe";

@injectable()
export class GetStatusRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.GetStatusAction>
{
    constructor(@inject(Configuration) private configuration: Configuration) {}
    handle(
        req: Protocol.GetStatusAction[0]
    ): PromiseOrNot<Protocol.GetStatusAction[1]> {
        return {
            echo: req.echo,
            data: {
                good: true,
                bots: [
                    {
                        online: true,
                        self: {
                            platform: "wechat",
                            user_id: this.configuration.user.id,
                        },
                    },
                ],
            },
        };
    }
    readonly action = "get_status";
}
