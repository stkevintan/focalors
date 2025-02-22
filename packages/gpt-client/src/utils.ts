import { createLogger, Logger } from "@focalors/logger";
import {
    MessageSegment,
    ReplyMessageSegment,
    TextMessageSegment,
} from "@focalors/onebot-protocol";

const logger: Logger = createLogger("gpt-client-utils");

export function stripCommandAndAt(text: string): string {
    if (!text) {
        return text;
    }
    return text.replace(/@\S+/g, "").replace(/^\/\w+\s+/, "");
}

export function getPrompt(
    message: MessageSegment[],
    tokenLimit?: number
): [prompt?: string, reply?: ReplyMessageSegment["data"]] {
    const segment = message.find(
        (m): m is TextMessageSegment => m.type === "text"
    );
    const replySegment = message.find(
        (m): m is ReplyMessageSegment => m.type === "reply"
    );

    const text = stripCommandAndAt(segment?.data.text ?? "").trim();
    if (tokenLimit && text.length > tokenLimit) {
        logger.warn(
            `prompt token exceeded ${tokenLimit}: ${text?.length ?? 0}, skip...`
        );
        return [];
    }
    if (
        replySegment &&
        ["text", "image"].includes(replySegment.data.message_type)
    ) {
        logger.info("Processing prompt with context: %s", text);
        return [text, replySegment.data];
    }
    if (text) {
        logger.info(`Processing prompt: ${text}`);
        return [text];
    }
    logger.warn(`Empty prompt, skip...`);
    return [];
}
