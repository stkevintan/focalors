import { PromiseOrNot, Protocol } from "@focalors/yunzai-client";
import { TOKENS } from "src/tokens";
import { inject, injectable } from "tsyringe";
import { Wechaty } from "wechaty";

@injectable()
export class GetGroupListRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.GetGroupListAction>
{
    constructor(@inject(TOKENS.wechaty) private bot: Wechaty) {}
    readonly action = "get_group_list";
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
