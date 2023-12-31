import { format } from "util";
import { singleton } from "tsyringe";
import { ScanStatus, types, WechatyBuilder } from "wechaty";
import qrcodeTerminal from "qrcode-terminal";
import { logger as parentLogger } from "./logger";
import { AsyncService, Protocol, YunzaiClient } from "@focalors/yunzai-client";

const logger = parentLogger.getSubLogger({ name: "wechat" });
@singleton()
export class Wechat implements AsyncService {
    private self = WechatyBuilder.build({ name: "focalors-bot" });
    constructor() {}
    async start() {
        logger.info(
            "wechaty starts with puppet:",
            process.env["WECHATY_PUPPET"]
        );
        this.self.on("scan", onScan);
        await this.self.start();
        await this.self.ready();
        logger.info("wechat started");
    }

    async stop() {
        await this.self.logout();
    }

    get bot() {
        return this.self;
    }

    bridge(client: YunzaiClient) {
        // subscribe bot to client
        this.self.on("message", (message) => {
            const talker = message.talker();
            const room = message.room();
            if (message.type() !== types.Message.Text) {
                logger.debug(`unsupported message type: ${message.type()}`);
                return;
            }
            const type = message.talker().type();
            if (type !== types.Contact.Individual) {
                logger.debug("unsupported user type:", type);
                return;
            }
            const isRoom = room !== null;
            if (!isRoom && !talker.friend() && !message.self()) {
                logger.warn(
                    `unqualified user:`,
                    `room(${isRoom}), friend(${talker.friend()}), self(${message.self()})`
                );
                return;
            }

            let text = message.text();
            // only messages startsWith text will go on.
            if (!/^\s*#/.test(text)) {
                logger.warn(`message without prefix #`);
                return;
            }
            // if message startswith `#<space>`, remove the prefix.
            text = text.replace(/^\s*#\s+/, "");
            logger.info("message processing:", text);
            const segment: Protocol.MessageSegment[] = [
                {
                    type: "text",
                    data: { text },
                },
            ];
            if (room) {
                void client.sendMessageEvent(
                    segment,
                    this.self.currentUser.id,
                    {
                        groupId: room.id,
                        userId: talker.id,
                    }
                );
            } else {
                void client.sendMessageEvent(
                    segment,
                    this.self.currentUser.id,
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
