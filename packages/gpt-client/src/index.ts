import {
    KnownActionMap,
    MessageSegment,
    MessageTarget2,
    OnebotClient,
    OnebotWechat,
    PromiseOrNot,
} from "@focalors/onebot-protocol";
export class GPTClient extends OnebotClient {
    start(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    stop(): Promise<void> {
        throw new Error("Method not implemented.");
    }

    on<
        K extends
            | "get_status"
            | "get_version"
            | "get_self_info"
            | "get_friend_list"
            | "get_group_list"
            | "get_group_member_info"
            | "upload_file"
            | "send_message"
    >(
        action: K,
        callback: (
            params: KnownActionMap[K]["req"]
        ) => PromiseOrNot<KnownActionMap[K]["res"]>
    ): () => void {
        this.eventSub
    }

    receive(
        message: MessageSegment[],
        from: MessageTarget2,
        wechat: OnebotWechat
    ): Promise<boolean> {

    }
}
