import { Configuration } from "../config";
import { ActionRouteHandler, GetStatusAction, PromiseOrNot } from "src/types";
import { inject, singleton } from "tsyringe";

@singleton()
export class GetStatusRouteHandler
    implements ActionRouteHandler<GetStatusAction>
{
    constructor(@inject(Configuration) private configuration: Configuration) {}
    handle(req: GetStatusAction[0]): PromiseOrNot<GetStatusAction[1]> {
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
