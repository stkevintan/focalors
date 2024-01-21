import {
    AccessManager,
    expandTarget,
    injectAccessManager,
    MessageSegment,
    MessageTarget2,
    OnebotClient,
    OnebotWechat,
    OnebotWechatToken,
    RedisClient,
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
import { getPrompt } from "./utils";
import { readFile, rm } from "fs/promises";
import { Dalle3Client } from "./dalle3";

@injectable()
export class GPTClient extends OnebotClient {
    private openai: OpenAI;
    constructor(
        @inject(Configuration) protected configuration: Configuration,
        @inject(OnebotWechatToken) wechat: OnebotWechat,
        @injectAccessManager("gpt") protected accessManager: AccessManager,
        @inject(RedisClient) protected redis: RedisClient,
        @inject(Dalle3Client) protected dalle3Client: Dalle3Client
    ) {
        super(wechat);
        this.openai = new OpenAI({
            baseURL: `${configuration.endpoint}/openai/deployments/${configuration.deployment}`,
            defaultQuery: { "api-version": configuration.apiVersion },
            defaultHeaders: { "api-key": configuration.apiKey },
            apiKey: configuration.apiKey,
        });
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

        if (
            !(await this.accessManager.check(target.groupId || target.userId!))
        ) {
            return false;
        }
        const key = createConversationKey(target.groupId || target.userId!);
        if (matchPattern(message, /\/gpt\s+clear/)) {
            await this.redis.del(key);
            this.sendText(`上下文已清除`, from);
            return true;
        }

        // if no one at me or reply me in a group
        if (
            target.groupId &&
            !message.some(
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

        const name = target.groupId ? target.userId! : undefined;

        // store prompts in reverse order
        const prompt: ChatCompletionMessageParam[] = [
            { role: "user", content: text, name },
        ];
        // if the message was replied, add the reply content into context
        const contextSegment = message.find(
            (m): m is ReplyMessageSegment => m.type === "reply"
        );
        let keepContext = true;
        if (contextSegment) {
            const {
                message_content: content,
                message_id: id,
                message_type: messageType,
                user_id: userId,
            } = contextSegment.data;
            const isReplyMe = userId === this.wechat.self.id;

            if (messageType === "text" && typeof content === "string") {
                const text = stripAt(content)
                    .trim()
                    .substring(0, this.configuration.tokenLimit);
                if (!isReplyMe) {
                    prompt.push({
                        role: "user",
                        content: text,
                        name: userId,
                    });
                }
                logger.debug(`Prepended assistant context:`, content);
            }

            if (messageType === "image") {
                try {
                    keepContext = false;
                    this.sendText("🔍 正在识图...", from);
                    // firstly we download the image
                    const p = await this.wechat.downloadImage(id);
                    if (!p) {
                        this.sendText("图片解码失败", from);
                        return true;
                    }
                    logger.debug("Downloaded wechat image to", p);
                    prompt[0].content = [
                        {
                            type: "text",
                            text,
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: await imageToDataUrl(p),
                            },
                        },
                    ];
                } catch (err) {
                    logger.error("Failed to process image", err);
                }
            }
        }

        try {
            const messages = keepContext
                ? await this.createConversation(prompt, key)
                : prompt;
            const completion = await this.openai.chat.completions.create({
                messages,
                model: this.configuration.deployment ?? "",
                // how many tokens gpt can return
                max_tokens: this.configuration.tokenLimit,
                // tools: [
                //     {
                //         type: "function",
                //         function: {
                //             function: (prompt) => this.generateImage(),
                //             description: "generate image by Dall-e 3",
                //             parameters: { type: "string" },
                //         },
                //     },
                // ],
            });
            const assistant = completion.choices[0]?.message.content;
            assert(assistant, `Assistant returned with empty`);
            if (keepContext) {
                await this.pushMessageCache(key, [
                    {
                        role: "assistant",
                        content: assistant,
                    },
                ]);
            }
            this.sendText(assistant, from);
            logger.debug(`Completion processed`);
            return true;
        } catch (err) {
            if (err instanceof APIError) {
                this.sendText(
                    `🚫 糟糕, 接口${err.status}啦! ${err.code ?? ""}`,
                    from
                );
                logger.error(`Completion API error:`, err);
                return true;
            }
            logger.error(`Completion failed:`, err);
            return false;
        }
    }

    private async createConversation(
        prompt: ChatCompletionMessageParam[],
        key: string
    ): Promise<ChatCompletionMessageParam[]> {
        const resp = (await this.redis.slice(
            key,
            0,
            this.configuration.contextLength
        )) as ChatCompletionMessageParam[];
        const conversations = prompt.concat(resp);
        try {
            await this.pushMessageCache(key, prompt);
        } catch (err) {
            logger.error("Failed to push message cache:", key);
        }
        return conversations.reverse();
    }

    private async pushMessageCache(
        key: string,
        entries: ChatCompletionMessageParam[]
    ): Promise<void> {
        this.redis.unshift(key, ...entries);

        if (Math.random() > 0.5) {
            await this.redis.lTrim(key, 0, this.configuration.contextLength);
        }
    }

    override async start(): Promise<void> {
        assert(this.configuration.apiKey, "OPENAI_APIKEY is empty");
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

function createConversationKey(id: string) {
    return `gpt:prompt:${id}`;
}

async function imageToDataUrl(filepath: string): Promise<string> {
    const base64 = await readFile(filepath, "base64");
    const url = `data:image/jpeg;base64,${base64}`;
    void rm(filepath).catch((err) => {
        logger.error("failed to remove file:", filepath, err);
    });
    return url;
}
