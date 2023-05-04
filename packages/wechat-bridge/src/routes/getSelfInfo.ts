import { Protocol } from "@focalors/yunzai-client";
import { TOKENS } from "../tokens";
import { inject, injectable } from "tsyringe";
import { Wechaty } from "wechaty";

@injectable()
export class GetSelfInfoRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.GetSelfInfoAction>
{
    constructor(@inject(TOKENS.wechaty) private bot: Wechaty) {}
    readonly action = "get_self_info";
    handle(req: Protocol.GetSelfInfoAction[0]): Protocol.GetSelfInfoAction[1] {
        const user = this.bot.currentUser;
        return {
            echo: req.echo,
            data: {
                user_id: user.id,
                user_name: user.name(),
                user_displayname: "",
            },
        };
    }
}
