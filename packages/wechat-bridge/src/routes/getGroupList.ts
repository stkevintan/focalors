import { Protocol } from "@focalors/yunzai-client";
import { inject, injectable } from "tsyringe";
import { Wechat } from "../wechaty";

@injectable()
export class GetGroupListRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.GetGroupListAction>
{
    constructor(@inject(Wechat) private wechat: Wechat) {}
    readonly action = "get_group_list";
    private get bot() {
        return this.wechat.getBot();
    }
    async handle(
        req: Protocol.GetGroupListAction[0]
    ): Promise<Protocol.GetGroupListAction[1]> {
        const groups = await this.bot.Room.findAll();
        return {
            echo: req.echo,
            data: await Promise.all(
                groups.map(async (group) => ({
                    group_id: group.id,
                    group_name: await group.topic(),
                }))
            ),
        };
    }
}
