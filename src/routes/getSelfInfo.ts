import { Configuration } from "../config";
import { ActionRouteHandler, GetSelfInfoAction, PromiseOrNot } from "src/types";
import { inject, singleton } from "tsyringe";

@singleton()
export class GetSelfInfoRouteHandler
    implements ActionRouteHandler<GetSelfInfoAction>
{
    constructor(@inject(Configuration) private configuration: Configuration) {}
    readonly action = "get_self_info";
    handle(req: GetSelfInfoAction[0]): PromiseOrNot<GetSelfInfoAction[1]> {
        return {
            echo: req.echo,
            data: {
                user_id: this.configuration.user.id,
                user_name: this.configuration.user.name,
                user_displayname: this.configuration.user.displayName,
            },
        };
    }
}
