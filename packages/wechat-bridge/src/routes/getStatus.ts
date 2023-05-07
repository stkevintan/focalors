import { Protocol } from "@focalors/yunzai-client";
import { inject, injectable } from "tsyringe";
import { Wechat } from "../wechat";

@injectable()
export class GetStatusRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.GetStatusAction>
{
    constructor(@inject(Wechat) private wechat: Wechat) {}
    private get bot() {
        return this.wechat.bot;
    }

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
