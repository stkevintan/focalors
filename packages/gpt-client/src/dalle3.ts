import {
    AccessManager,
    injectAccessManager,
    matchPattern,
    MessageSegment,
    MessageTarget2,
    OnebotClient,
    OnebotWechat,
    OnebotWechatToken,
} from "@focalors/onebot-protocol";
import { inject, injectable } from "tsyringe";
import { APIError, OpenAI } from "openai";
import { Configuration } from "./config";
import { getPrompt } from "./utils";
import { ImageGenerateParams } from "openai/resources";
import { createLogger, Logger } from "@focalors/logger";
import { GPTClient } from "./gpt4";
import assert from "assert";
import { inspect } from "util";

const logger: Logger = createLogger("dalle-client");

@injectable()
export class Dalle3Client extends OnebotClient {
    private openai: OpenAI;
    constructor(
        @inject(Configuration) protected configuration: Configuration,
        @inject(OnebotWechatToken) wechat: OnebotWechat,
        @inject(GPTClient) protected gptClient: GPTClient,
        @injectAccessManager("dalle") protected accessManager: AccessManager
    ) {
        super(wechat);
        this.openai = new OpenAI({
            baseURL: `${configuration.endpoint}/openai/deployments/${configuration.dalleDeployment}`,
            defaultQuery: { "api-version": configuration.apiVersion },
            defaultHeaders: { "api-key": configuration.apiKey },
            apiKey: configuration.apiKey,
        });
    }

    async recv(
        message: MessageSegment[],
        from: MessageTarget2
    ): Promise<boolean> {
        const out = await this.accessManager.manage(message, from.userId);
        if (out) {
            this.sendText(out, from);
            return true;
        }
        if (!(await this.accessManager.check(from.userId, from.groupId))) {
            return false;
        }
        if (!matchPattern(message, /^\/(img|imagine prompt:)/)) {
            return false;
        }

        const [text, reply] = getPrompt(message, this.configuration.tokenLimit);
        if (!text) {
            return false;
        }
        try {
            this.sendText("🧑‍🎨 正在作图...", from);
            if (reply?.message_type === "image") {
                logger.info("Replied an image, invoke GPT4v first");
                // firstly we download the image
                const url = await this.wechat.downloadImage(reply.message_id);
                const assistant = await this.gptClient.completion([
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "describe this picture in keywords with style",
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url,
                                },
                            },
                        ],
                    },
                ]);
                logger.debug("Got completion response: %s", assistant);
                assert(assistant, `Empty completion response`);
                await this.handleImage(`${text},${assistant}`, from);
            } else if (reply?.message_type === "text") {
                await this.handleImage(
                    `${reply.message_content}\n${text.replace(/^prompt:/, "")}`,
                    from
                );
            } else {
                await this.handleImage(text.replace(/^prompt:/, ""), from);
            }
        } catch (e) {
            logger.error(`Processing image error: ${inspect(e)}`);
            if (e instanceof APIError) {
                this.sendText(
                    `🚫 糟糕, 接口${e.status}啦! ${e.code ?? ""}`,
                    from
                );
            } else {
                this.sendText(
                    `🚫 糟糕, ${e instanceof Error ? e.message : e}`,
                    from
                );
            }
        }
        return true;

        // if (text.startsWith("/ivar")) {
        //     try {
        //         const reply = message.find(
        //             (m): m is ReplyMessageSegment => m.type === "reply"
        //         );
        //         if (!reply) {
        //             this.sendText(`⚠️ 请回复一张图片`, from);
        //             return true;
        //         }
        //         await this.handleImageVariant(reply, from);
        //     } catch (e) {
        //         logger.error("handle image error:", e);
        //         if (e instanceof APIError) {
        //             this.sendText(
        //                 `🚫 糟糕, 接口${e.status}啦! ${e.code ?? ""}`,
        //                 from
        //             );
        //         }
        //     }
        //     return true;
        // }
        return false;
    }

    async generate(prompt: string, keywords: Record<string, boolean> = {}) {
        logger.debug(`Generating image with prompt: %s, %o`, prompt, keywords);
        const params: ImageGenerateParams = {
            prompt: `I NEED to test how the tool works with extremely simple prompts. DO NOT add any detail, just use it AS-IS:${prompt}`,
            n: 1,
            quality: keywords["hd"] ? "hd" : "standard",
            response_format: "url",
            // "1024x1024" | "1792x1024" | "1024x1792"
            size: "1024x1024",
            style: keywords["natural"] ? "natural" : "vivid",
        };
        return await this.openai.images.generate(params);
    }

    private async handleImage(prompt: string, from: MessageTarget2) {
        const keywords = {
            hd: false,
            natural: false,
        } as Record<string, boolean>;
        const words = prompt.split(/\s+/);
        for (const [i, word] of words.entries()) {
            if (Object.hasOwn(keywords, word)) {
                keywords[word] = true;
            } else {
                prompt = words.slice(i).join(" ");
                break;
            }
        }

        if (!prompt) {
            logger.debug(`Generating image with empty prompt, skip...`);
            this.sendText("给点提示嘛~", from);
            return;
        }

        const ret = await this.generate(prompt, keywords);
        let hasSent = false;
        for (const image of ret.data) {
            if (image.url) {
                hasSent = true;
                await this.sendFile(
                    {
                        type: "url",
                        url: image.url!,
                    },
                    from
                );
            }
            logger.debug("Image revised_prompt: %s", image.revised_prompt);
        }
        if (!hasSent) {
            logger.warn("Empty image generating response");
            this.sendText("糟糕，生成失败", from);
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// private async handleImageVariant(
//     reply: ReplyMessageSegment,
//     from: MessageTarget2
// ) {
// const svrid = reply.data.message_id;
// const p = await this.wechat.downloadImage(svrid);
// if (p) {
//     // this.sendText(p, from);
//     const [stream, discard] = await this.createImageStream(p);
//     await this.openai.images.edit({
//         image: stream,
//     })
// } else {
//     this.sendText('可恶,下载图片失败了', from);
// }

// private async createImageStream(p: string): Promise<[ReadStream, () => Promise<void>] {
//     const r = createReadStream(p);
// }
