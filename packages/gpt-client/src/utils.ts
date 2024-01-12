import { MessageSegment, TextMessageSegment } from "@focalors/onebot-protocol";
import { logger } from "./logger";

export function stripAt(text: string): string {
    if (!text) {
        return text;
    }
    return text.replace(/@\S+/g, "");
}

export function getPrompt(message: MessageSegment[], tokenLimit?: number) {
    const segment = message.find(
        (m): m is TextMessageSegment => m.type === "text"
    );
    const text = stripAt(segment?.data.text ?? "").trim();
    if (!text || tokenLimit && text.length > tokenLimit) {
        logger.warn(`Invalid text length: ${text?.length ?? 0}, skip...`);
        return null;
    }
    logger.debug(`Processing for ${text}...`);
    return text;
}

export function matchPattern(message: MessageSegment[], pattern: RegExp) {
    const first = message.find(
        (m): m is TextMessageSegment => m.type === "text"
    );
    return first?.data.text.match?.(pattern);
}