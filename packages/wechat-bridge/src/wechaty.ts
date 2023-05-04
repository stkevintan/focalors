import { format } from "util";
import { container } from "tsyringe";
import { ContactSelf, ScanStatus, WechatyBuilder } from "wechaty";
import qrcodeTerminal from "qrcode-terminal";
import { logger } from "./logger";
import { TOKENS } from "./tokens";
import { Configuration } from "./config";

export async function createWechaty() {
    logger.info("wechaty starts with puppet:", process.env["WECHATY_PUPPET"]);
    const wechaty = WechatyBuilder.build({ name: "focalors-bot" });
    container.register(TOKENS.wechaty, { useValue: wechaty });
    const configuration = container.resolve(Configuration);
    logger.info(configuration.base);
    wechaty.on("scan", onScan);
    const [_, user] = await Promise.all([
        wechaty.start(),
        new Promise<ContactSelf>((res) => {
            wechaty.once("login", (user) => res(user));
        }),
    ]);
    logger.info("wechaty logged in with", user);
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
