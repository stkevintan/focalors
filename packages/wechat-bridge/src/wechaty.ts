import { format } from "util";
import { singleton } from "tsyringe";
import { ScanStatus, types, WechatyBuilder } from "wechaty";
import qrcodeTerminal from "qrcode-terminal";
import { logger } from "./logger";
import { Protocol, YunzaiClient } from "@focalors/yunzai-client";

@singleton()
export class Wechat {
    private bot = WechatyBuilder.build({ name: "focalors-bot" });
    constructor() {}
    async run() {
        logger.info(
            "wechaty starts with puppet:",
            process.env["WECHATY_PUPPET"]
        );
        this.bot.on("scan", onScan);
        await Promise.all([
            this.bot.start(),
            new Promise<void>((res) => this.bot.once("login", () => res())),
        ]);
    }

    getBot() {
        return this.bot;
    }

    bridge(client: YunzaiClient) {
        // subscribe bot to client
        this.bot.on("message", (message) => {
            const talker = message.talker();
            const room = message.room();
            if (message.type() !== types.Message.Text) {
                logger.debug(
                    "message stop processing:",
                    "unexpected message type:",
                    message.type()
                );
                return;
            }
            const type = message.talker().type();
            if (type !== types.Contact.Individual) {
                logger.debug(
                    "message stop processing:",
                    "unexpected talker:",
                    type
                );
                return;
            }
            const isRoom = room !== null;

            if (!isRoom && !talker.friend() && !message.self()) {
                logger.warn(
                    `message stop processing: user is not qualified`,
                    `room: ${isRoom}, friend: ${talker.friend()}, self: ${message.self()}`
                );
                return;
            }

            let text = message.text();
            // only messages startsWith text will go on.
            if (!/^\s*#/.test(text)) {
                logger.warn(
                    "message stop processing:",
                    `text doesn't prefix with #`
                );
                return;
            }
            // if message startswith `#<space>`, remove the prefix.
            text = text.replace(/^\s*#\s+/, "");
            logger.info("receive message:", text);
            const segment: Protocol.MessageSegment[] = [
                {
                    type: "text",
                    data: { text },
                },
            ];
            if (room) {
                void client.sendMessageEvent(segment, this.bot.currentUser.id, {
                    groupId: room.id,
                    userId: talker.id,
                });
            } else {
                void client.sendMessageEvent(
                    segment,
                    this.bot.currentUser.id,
                    talker.id
                );
            }
        });
    }
}

function onScan(qrcode: string, status: ScanStatus) {
    if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
        const qrcodeImageUrl = [
            "https://wechaty.js.org/qrcode/",
            encodeURIComponent(qrcode),
        ].join("");
        logger.info(
            format(
                "onScan: %s(%s) - %s",
                ScanStatus[status],
                status,
                qrcodeImageUrl
            )
        );

        qrcodeTerminal.generate(qrcode, { small: true }); // show qrcode on console
    } else {
        logger.info(format("onScan: %s(%s)", ScanStatus[status], status));
    }
}
