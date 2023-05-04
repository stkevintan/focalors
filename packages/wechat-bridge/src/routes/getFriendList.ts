import { Protocol } from "@focalors/yunzai-client";
import { inject, injectable } from "tsyringe";
import { Wechat } from "../wechaty";

@injectable()
export class GetFriendListRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.GetFriendListAction>
{
    constructor(@inject(Wechat) private wechat: Wechat) {}
    readonly action = "get_friend_list";
    private get bot() {
        return this.wechat.getBot();
    }
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
