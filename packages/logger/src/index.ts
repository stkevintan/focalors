import os from "os";
import { mkdirSync } from "fs";
import path from "path";
import { ILogObj, IMeta, ISettingsParam, Logger } from "tslog";
import * as fileStreamRotator from "file-stream-rotator";

export interface CreateLoggerParams extends ISettingsParam<unknown> {
    // make nxjs swc build happy
    name?: string;
    filename?: string;
    frequency?: string;
    size?: string;
    max_log?: string;
    audit_file?: string;
}

export function createLogger(settings: CreateLoggerParams = {}) {
    const logger = new Logger({
        minLevel: 2,
        ...settings,
    });
    logger.attachTransport(logFileTransport);

    const filename =
        settings.filename ?? path.resolve(__dirname, "../logs/stdout.log");
    try {
        const dir = path.dirname(filename);
        mkdirSync(dir, { recursive: true });
    } catch {}
    const basename = path.basename(filename);
    const stream = fileStreamRotator.getStream({
        filename,
        frequency: settings.frequency ?? "daily",
        size: settings.size ?? "5M",
        max_logs: settings.max_log ?? "100",
        date_format: "Y-M-D",
        extension: ".log",
        audit_file:
            settings.audit_file ??
            path.resolve(os.tmpdir(), `${basename}-audit.json`),
    });

    function logFileTransport(logObject: ILogObj) {
        const logMeta = logObject["_meta"] as IMeta;
        let parentString = logMeta.parentNames?.join(":") || "";
        if (parentString) {
            parentString = `${parentString}:`;
        }

        const line = `${logMeta.date.toISOString()} - ${
            logMeta.logLevelName
        }: [${parentString}${logMeta.name ?? "root"}] ${logObject[0]}\n`;
        stream.write(line, "utf8");
    }
    return logger;
}

export type { Logger };
