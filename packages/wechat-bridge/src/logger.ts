import { appendFileSync, mkdirSync } from "fs";
import path from "path";
import { ILogObj, IMeta, Logger } from "tslog";

export const logger = new Logger({
    minLevel: 3,
});
logger.attachTransport(logFileTransport);

let isDirMd = false;
const logp = path.resolve(__dirname, "../logs/stdout.log");
const dir = path.dirname(logp);

function logFileTransport(logObject: ILogObj) {
    const logMeta = logObject["_meta"] as IMeta;
    let parentString = logMeta.parentNames?.join(":") || "";
    if (parentString) {
        parentString = `${parentString}:`;
    }

    if (!isDirMd) {
        try {
            mkdirSync(dir, { recursive: true });
        } finally {
            isDirMd = true;
        }
    }
    appendFileSync(
        logp,
        `${logMeta.date.toISOString()} - ${
            logMeta.logLevelName
        }: [${parentString}${logMeta.name ?? "root"}] ${logObject[0]}\n`
    );
}
