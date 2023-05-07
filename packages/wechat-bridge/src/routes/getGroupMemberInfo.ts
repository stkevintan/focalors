import assert from "assert";
import { Protocol } from "@focalors/yunzai-client";
import { inject, injectable } from "tsyringe";
import { Wechat } from "../wechat";

@injectable()
export class GetGroupMemberInfoRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.GetGroupMemberInfoAction>
{
    constructor(@inject(Wechat) private wechat: Wechat) {}
    readonly action = "get_group_member_info";
    private get bot() {
        return this.wechat.bot;
    }
    async handle(
        req: Protocol.GetGroupMemberInfoAction[0]
    ): Promise<Protocol.GetGroupMemberInfoAction[1]> {
        const { user_id, group_id } = req.params;
        const user = await this.bot.Contact.find({ id: user_id });
        assert.ok(user != null, `user ${user_id} in ${group_id} is not found`);
        return {
            echo: req.echo,
            data: {
                user_id,
                user_displayname: "",
                user_name: user.name(),
                "wx.avatar": user.payload?.avatar ?? "",
                "wx.wx_number": user_id,
                "wx.province": user.province(),
                "wx.city": user.city(),
            },
        };
    }
}
