import { Protocol, PromiseOrNot } from "@focalors/yunzai-client";
import { TOKENS } from "src/tokens";
import { inject, injectable } from "tsyringe";
import { Wechaty } from "wechaty";

@injectable()
export class GetStatusRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.GetStatusAction>
{
    constructor(@inject(TOKENS.wechaty) private bot: Wechaty) {}
    handle(req: Protocol.GetStatusAction[0]): Protocol.GetStatusAction[1] {
        return {
            echo: req.echo,
            data: {
                good: true,
                bots: [
                    {
                        online: true,
                        self: {
                            platform: "wechat",
                            user_id: this.bot.currentUser.id,
                        },
                    },
                ],
            },
        };
    }
    readonly action = "get_status";
}
