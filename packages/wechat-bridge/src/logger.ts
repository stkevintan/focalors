import { appendFileSync } from "fs";
import path from "path";
import { ILogObj, IMeta, Logger } from "tslog";

export const logger = new Logger({
    minLevel: 3,
});
logger.attachTransport(logFileTransport);

const logp = path.resolve(__dirname, "../logs/stdout.log");

function logFileTransport(logObject: ILogObj) {
    const logMeta = logObject["_meta"] as IMeta;
    let parentString = logMeta.parentNames?.join(":") || "";
    if (parentString) {
        parentString = `${parentString}:`;
    }

    appendFileSync(
        logp,
        `${logMeta.date.toISOString()} - ${
            logMeta.logLevelName
        }: [${parentString}${logMeta.name}] ${logObject[0]}\n`
    );
}
