import { inject, singleton } from "tsyringe";
import { WechatClientBase } from "./base";
import { Chatroom } from "./chatroom";
import { EnvelopeService } from "./envelope";
import { Friend } from "./friend";
import { LoginService } from "./login";
import { Message } from "./message";
import { Tool } from "./tool";
import { User } from "./user";

@singleton()
export class WechatClient {
    get wxid(): string | undefined {
        return this.client.wxid;
    }

    get nickname(): string | undefined {
        return this.client.nickname;
    }

    constructor(
        @inject(WechatClientBase) private readonly client: WechatClientBase,
        @inject(EnvelopeService) readonly envelopeService: EnvelopeService,
        @inject(User) readonly user: User,
        @inject(Tool) readonly tool: Tool,
        @inject(Message) readonly message: Message,
        @inject(Chatroom) readonly chatroom: Chatroom,
        @inject(LoginService) readonly loginService: LoginService,
        @inject(Friend) readonly friend: Friend
    ) {}

    async isRunning(): Promise<boolean> {
        return this.loginService.isRunning();
    }

    async checkDatabase(): Promise<boolean> {
        return this.tool.checkDatabase();
    }
}
