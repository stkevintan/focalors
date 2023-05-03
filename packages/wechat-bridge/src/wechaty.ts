import { format } from "util";
import { container } from "tsyringe";
import { ScanStatus, WechatyBuilder } from "wechaty";
import qrcodeTerminal from "qrcode-terminal";
import { logger } from "./logger";
import { TOKENS } from "./tokens";
import { Configuration } from "./config";

const wechaty = WechatyBuilder.build({ name: "focalors-bot" });

container.register(TOKENS.wechaty, { useValue: wechaty });
export async function runBot() {
    wechaty.on("scan", onScan);
    wechaty.on("login", (user) => {
        const configuration = container.resolve(Configuration);
        configuration.user.id = user.id;
        configuration.user.name = user.name();
    });
    await wechaty.start();
    return wechaty;
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
