import { singleton } from "tsyringe";
import { FriendInfo, GroupInfo } from "./types";

@singleton()
export class Configuration {
    readonly user = {
        id: "10086",
        name: "administrator",
        displayName: "Admin",
    };

    readonly ws = {
        port: 2536,
        path: "/ComWeChat",
        proto: "ws",
        host: `localhost`,
        get endpoint() {
            return `${this.proto}://${this.host}:${this.port}${this.path}`;
        },
    };

    readonly friends: FriendInfo[] = [
        {
            user_id: "10010",
            user_displayname: "User",
            user_name: "user",
            user_remark: "user",
            "wx.verify_flag": "1",
        },
    ];

    readonly groups: GroupInfo[] = [];
}
