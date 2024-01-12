import path from "path";
import {
    expandTarget,
    MessageSegment,
    MessageTarget2,
    OnebotClient,
    OnebotWechat,
    OnebotWechatToken,
    ReplyMessageSegment,
    TextMessageSegment,
} from "@focalors/onebot-protocol";
import { OpenAI } from "openai";

import { inject, injectable } from "tsyringe";
import { logger } from "./logger";
import { Configuration } from "./config";
import assert from "assert";
import { ChatCompletionMessageParam } from "openai/resources";
import { APIError } from "openai/error";
import { randomUUID } from "crypto";
import { AccessManager } from "./access-manager";
import { getPrompt } from "./utils";

@injectable()
export class GPTClient extends OnebotClient {
    private openai: OpenAI;
    constructor(
        @inject(Configuration) protected configuration: Configuration,
        @inject(OnebotWechatToken) protected wechat: OnebotWechat,
        @inject(AccessManager) protected accessManager: AccessManager
    ) {
        super();
        this.openai = new OpenAI({
            baseURL: `${configuration.endpoint}/openai/deployments/${configuration.deployment}`,
            defaultQuery: { "api-version": configuration.apiVersion },
            defaultHeaders: { "api-key": configuration.apiKey },
            apiKey: configuration.apiKey,
        });
    }

    private async sendFileOrImage(
        type: "image" | "file",
        params: Parameters<OnebotWechat["cacheFile"]>[0],
        target: MessageTarget2
    ) {
        const id = await this.wechat.cacheFile(params);
        this.send(
            [
                {
                    type,
                    data: { file_id: id },
                },
            ],
            target
        );
    }

    private async sendErrorImage(from: MessageTarget2) {
        await this.sendFileOrImage(
            "image",
            {
                type: "path",
                path: path.resolve(__dirname, "../assets/error.jpg"),
                name: "wechat-gpt-client-api-error.jpg",
            },
            from
        );
    }

    override async recv(
        message: MessageSegment[],
        from: MessageTarget2
    ): Promise<boolean> {
        const target = expandTarget(from);
        const out = await this.accessManager.manage(message, target.userId);
        if (out) {
            this.sendText(out, from);
            return true;
        }

        if (await this.gif(message, from)) {
            return true;
        }

        if (
            !this.accessManager.check(message, target)
        ) {
            return false;
        }
        // if no one at me or reply me in a group
        if (
            target.groupId && !message.some(
                (m) =>
                    (m.type === "mention" || m.type === "reply") &&
                    m.data.user_id === this.wechat.self.id
            )
        ) {
            logger.debug(
                `I am not at or mentioned in group ${target.groupId}, skip...`
            );
            return false;
        }

        const text = getPrompt(message, this.configuration.tokenLimit);
        if (!text) {
            return false;
        }
        const messages: ChatCompletionMessageParam[] = [
            {
                role: "user",
                content: text,
            },
        ];
        // if the message was replied, add the reply content into context
        const contextSegment = message.find(
            (m): m is ReplyMessageSegment => m.type === "reply"
        );
        const context = contextSegment?.data.message_content;

        if (typeof context === "string") {
            const content = stripAt(context)
                .trim()
                .substring(0, this.configuration.tokenLimit);
            messages.unshift({
                role: "assistant",
                content,
            });
            logger.debug(`Prepended assistant context:`, content);
        }

        try {
            const completion = await this.openai.chat.completions.create({
                messages,
                model: this.configuration.deployment ?? "",
                max_tokens: 200
            });
            // for await (const part of completion) {
            //     const text = part.choices[0]?.delta?.content ?? "";
            //     this.send({ message: text, target: from });
            // }
            this.sendText(completion.choices[0]?.message.content ?? "", from);
            logger.debug(`Completion processed`);
            return true;
        } catch (err) {
            if (err instanceof APIError) {
                await this.sendErrorImage(from);
                logger.error(`Completion API error:`, err);
                return true;
            }
            logger.error(`Completion failed:`, err);
            return false;
        }
    }

    private async gif(
        message: MessageSegment[],
        from: MessageTarget2
    ): Promise<boolean> {
        const ret = matchPattern(message, /^\/gif\s*(\w+)\s+(.*)\s*$/);
        const sendUsage = () =>
            this.sendText(
                `Usage: /gif <name> <line1>,<line2>,...\nPS: get <name> from: https://sorry.xuty.cc/<name>`,
                from
            );
        if (ret?.[1]) {
            const url = `https://sorry.xuty.cc/${ret[1]}/make`;
            const body = ret[2]
                ? Object.fromEntries(
                      ret[2].split(",").map((t, i) => [i, t] as const)
                  )
                : {};
            const resp = await fetch(url, {
                method: "POST",
                body: JSON.stringify(body),
            });
            try {
                const text = await resp.text();
                /*
                <p>
                    <a href="/cache/edcbe646b8b0a9d83f0675b9545c745b.gif" target="_blank">
                        <p>点击下载</p>
                    </a>
                </p>
                */
                const matchRet = text.match(/href\s*=\s*"(.*\.gif)"/);
                if (matchRet?.[1]) {
                    this.sendFileOrImage(
                        "image",
                        {
                            type: "url",
                            url: `https://sorry.xuty.cc/${matchRet[1]}`,
                            name: `${randomUUID()}.gif`,
                        },
                        from
                    );
                } else {
                    sendUsage();
                }
            } catch (err) {
                await this.sendErrorImage(from);
                logger.error("make gif erorr:", err);
            }
            return true;
        }
        if (matchPattern(message, /^\/gif/)) {
            sendUsage();
            return true;
        }
        return false;
    }

    async start(): Promise<void> {
        assert(this.configuration.apiKey, "OPENAI_APIKEY is empty");
        await this.accessManager.start();
    }
    async stop(): Promise<void> {
        await this.configuration.syncToDisk();
        await this.accessManager.stop();
    }
}

function matchPattern(message: MessageSegment[], pattern: RegExp) {
    const first = message.find(
        (m): m is TextMessageSegment => m.type === "text"
    );
    return first?.data.text.match(pattern);
}

function stripAt(text: string): string {
    if (!text) {
        return text;
    }
    return text.replace(/@\S+/g, "");
}
