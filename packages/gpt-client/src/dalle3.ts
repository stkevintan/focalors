import {
    expandTarget,
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
import { logger } from "./logger";
import { AccessManager } from "./access-manager";

@injectable()
export class Dalle3Client extends OnebotClient {
    private openai: OpenAI;
    constructor(
        @inject(Configuration) protected configuration: Configuration,
        @inject(OnebotWechatToken) protected wechat: OnebotWechat,
        @inject(AccessManager) protected accessManager: AccessManager
    ) {
        super();
        this.openai = new OpenAI({
            baseURL: `${configuration.endpoint}/openai/deployments/${configuration.dalleDeployment}`,
            defaultQuery: { "api-version": configuration.apiVersion },
            defaultHeaders: { "api-key": configuration.apiKey },
            apiKey: configuration.apiKey,
        });
    }

    async start() {
        await this.accessManager.start();
    }

    async stop() {
        await this.accessManager.stop();
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

    async recv(
        message: MessageSegment[],
        from: MessageTarget2
    ): Promise<boolean> {
        const target = expandTarget(from);
        const out = await this.accessManager.manage(message, target.userId);
        if (out) {
            this.sendText(out, from);
            return true;
        }

        const text = getPrompt(message, this.configuration.tokenLimit);
        if (!text) {
            return false;
        }
        if (text.startsWith("/img")) {
            try {
                await this.handleImage(text.substring(4), from);
            } catch (e) {
                logger.error("handle image error:", e);
                if (e instanceof APIError) {
                    this.sendText(
                        `🚫 糟糕, 接口${e.status}啦! ${e.code ?? ""}`,
                        from
                    );
                }
            }
            return true;
        }
        return false;
    }

    private async handleImage(prompt: string, from: MessageTarget2) {
        // const validSize = {
        //     // x256: "256x256",
        //     // x512: "512x512",
        //     x1024: "1024x1024",
        //     "1792x1024": "1792x1024",
        //     "1024x1792": "1024x1792",
        // } as const;
        // const sizeKey = Object.keys(validSize).find((s) =>
        //     prompt.endsWith(` ${s}`)
        // ) as undefined | keyof typeof validSize;
        // if (sizeKey) {
        //     prompt = prompt.substring(0, prompt.length - sizeKey.length).trim();
        // }

        const keywords = {} as Record<string, boolean>;
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
            this.sendText("给点提示嘛~", from);
            return;
        }

        this.sendText("🧑‍🎨 正在作图...", from);
        this.openai.images.createVariation;
        const ret = await this.openai.images.generate({
            prompt,
            model: this.configuration.dalleDeployment,
            n: 1,
            quality: keywords["hd"] ? "hd" : "standard",
            response_format: "url",
            // "1024x1024" | "1792x1024" | "1024x1792"
            size: "1024x1024",
            style: keywords["vivid"] ? "vivid" : "natural",
        });
        let hasSent = false;
        for (const image of ret.data) {
            if (image.url) {
                hasSent = true;
                await this.sendFileOrImage(
                    "image",
                    {
                        type: "url",
                        url: image.url!,
                    },
                    from
                );
            }
        }
        if (!hasSent) {
            this.sendText("糟糕，生成失败", from);
        }
    }
}
