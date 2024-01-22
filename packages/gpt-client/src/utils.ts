import { createLogger, Logger } from "@focalors/logger";
import { MessageSegment, TextMessageSegment } from "@focalors/onebot-protocol";

const logger: Logger = createLogger("gpt-client-utils");

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
    if (!text || (tokenLimit && text.length > tokenLimit)) {
        logger.warn(`Invalid text length: ${text?.length ?? 0}, skip...`);
        return null;
    }
    logger.debug(`Processing for ${text}...`);
    return text;
}
