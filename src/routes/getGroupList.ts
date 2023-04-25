import { Configuration } from "../config";
import {
    ActionRouteHandler,
    GetGroupListAction,
    PromiseOrNot,
} from "src/types";
import { inject, singleton } from "tsyringe";

@singleton()
export class GetGroupListRouteHandler
    implements ActionRouteHandler<GetGroupListAction>
{
    constructor(@inject(Configuration) private configuration: Configuration) {}
    readonly action = "get_group_list";
    handle(req: GetGroupListAction[0]): PromiseOrNot<GetGroupListAction[1]> {
        return {
            echo: req.echo,
            data: this.configuration.groups,
        };
    }
}
