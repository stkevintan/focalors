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
    TextMessageSegment,
} from "@focalors/onebot-protocol";
import { OpenAI } from "openai";

import { inject, injectable } from "tsyringe";
import { Configuration } from "./config";
import assert from "assert";
import { ChatCompletionMessageParam } from "openai/resources";
import { APIError } from "openai/error";
import { getPrompt, stripCommandAndAt } from "./utils";
import { createLogger, Logger } from "@focalors/logger";

const logger: Logger = createLogger("gpt-client");

@injectable()
export class GPTClient extends OnebotClient {
    private openai: OpenAI;
    constructor(
        @inject(Configuration) protected configuration: Configuration,
        @inject(OnebotWechatToken) wechat: OnebotWechat,
        @injectAccessManager("gpt") protected accessManager: AccessManager,
        @inject(RedisClient) protected redis: RedisClient
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
            !(await this.accessManager.check(target.userId, target.groupId))
        ) {
            return false;
        }
        const key = createConversationKey(target.groupId || target.userId!);

        if (matchPattern(message, /^\/gpt\s+clear\s*$/)) {
            await this.redis.del(key);
            this.sendText(`上下文已清除`, from);
            return true;
        }
        const prefixedGpt = matchPattern(message, /^\/gpt\s+/);
        const privateChat = !target.groupId;
        const groupAt =
            target.groupId &&
            message.some(
                (m) =>
                    (m.type === "mention" || m.type === "reply") &&
                    m.data.user_id === this.wechat.self.id
            );

        logger.info(
            `Prefixed GPT: ${prefixedGpt} | Private chat: ${privateChat} | Group mention or reply: ${groupAt}`
        );

        if (!prefixedGpt && !(privateChat || groupAt)) {
            logger.info(
                `I am not replied or mentioned in group ${target.groupId}, skip...`
            );
            return false;
        }
        const [text, reply] = getPrompt(message, this.configuration.tokenLimit);
        if (!text) {
            return false;
        }
        const name = target.groupId ? target.userId! : undefined;

        // store prompts in reverse order
        const prompt: ChatCompletionMessageParam[] = [
            { role: "user", content: text, name },
        ];
        let keepContext = true;
        if (reply) {
            const {
                message_content: content,
                message_id: id,
                message_type: messageType,
                user_id: userId,
            } = reply;
            const isReplyMe = userId === this.wechat.self.id;

            if (messageType === "text" && typeof content === "string") {
                const text = stripCommandAndAt(content)
                    .trim()
                    .substring(0, this.configuration.tokenLimit);
                if (!isReplyMe) {
                    prompt.push({
                        role: "user",
                        content: text,
                        name: userId,
                    });
                }
                logger.debug(`Prepended assistant context: %s`, content);
            }

            if (messageType === "image") {
                if (!prefixedGpt) {
                    return true;
                }
                try {
                    keepContext = false;
                    this.sendText("🔍 正在识图...", from);
                    // firstly we download the image
                    const url = await this.wechat.downloadImage(id);
                    prompt[0].content = [
                        {
                            type: "text",
                            text,
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url,
                            },
                        },
                    ];
                } catch (err) {
                    logger.error("Failed to process image %O", err);
                    this.sendText("图片解码失败", from);
                    return true;
                }
            }
        }

        try {
            const assistant = await this.completion(
                prompt,
                keepContext ? key : undefined
            );
            assert(assistant, `Assistant returned with empty`);
            this.sendText(assistant, from);
            logger.info(`Completion processed`);
            return true;
        } catch (err) {
            if (err instanceof APIError) {
                this.sendText(
                    `🚫 糟糕, 接口${err.status}啦! ${err.code ?? ""}`,
                    from
                );
                logger.error(`Completion API error: %O`, err);
                return true;
            }
            logger.error(`Completion failed: %O`, err);
            return false;
        }
    }

    async completion(
        prompt: ChatCompletionMessageParam[],
        contextKey?: string
    ) {
        const messages = contextKey
            ? await this.createConversation(prompt, contextKey)
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
        if (contextKey) {
            await this.pushMessageCache(contextKey, [
                {
                    role: "assistant",
                    content: assistant,
                },
            ]);
        }
        return assistant;
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

function createConversationKey(id: string) {
    return `gpt:prompt:${id}`;
}

