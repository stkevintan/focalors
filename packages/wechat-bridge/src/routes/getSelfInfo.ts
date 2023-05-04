import { Protocol } from "@focalors/yunzai-client";
import { inject, injectable } from "tsyringe";
import { Wechat } from "../wechat";

@injectable()
export class GetSelfInfoRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.GetSelfInfoAction>
{
    constructor(@inject(Wechat) private wechat: Wechat) {}
    readonly action = "get_self_info";
    private get bot() {
        return this.wechat.bot;
    }
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
