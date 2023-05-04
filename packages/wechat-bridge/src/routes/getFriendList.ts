import { Protocol } from "@focalors/yunzai-client";
import { inject, injectable } from "tsyringe";
import { Wechaty } from "wechaty";

import { TOKENS } from "../tokens";

@injectable()
export class GetFriendListRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.GetFriendListAction>
{
    constructor(@inject(TOKENS.wechaty) private bot: Wechaty) {}
    readonly action = "get_friend_list";
    async handle(
        req: Protocol.GetFriendListAction[0]
    ): Promise<Protocol.GetFriendListAction[1]> {
        const friends = await this.bot.Contact.findAll();
        return {
            echo: req.echo,
            data: await Promise.all(
                friends.map(async (friend) => ({
                    user_id: friend.id,
                    user_name: friend.name(),
                    user_displayname: "",
                    user_remark: (await friend.alias()) ?? "",
                    "wx.verify_flag": friend.friend() ? "1" : "0",
                }))
            ),
        };
    }
}
