import { Configuration } from "../config";
import {
    ActionRouteHandler,
    GetFriendListAction,
    PromiseOrNot,
} from "src/types";
import { inject, singleton } from "tsyringe";

@singleton()
export class GetFriendListRouteHandler
    implements ActionRouteHandler<GetFriendListAction>
{
    constructor(@inject(Configuration) private configuration: Configuration) {}
    readonly action = "get_friend_list";
    handle(req: GetFriendListAction[0]): PromiseOrNot<GetFriendListAction[1]> {
        return {
            echo: req.echo,
            data: this.configuration.friends
        };
    }
}
