import os from "os";
import { mkdirSync } from "fs";
import path from "path";
import { ILogObj, ISettingsParam, Logger } from "tslog";
import * as fileStreamRotator from "file-stream-rotator";
import { logSyslogTransport } from "./syslog";
import { parseLogObj, shortFilePathLineCol } from "./format";

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
        type: "hidden",
    });
    logger.attachTransport(stdoutTransport);
    logger.attachTransport(logFileTransport);
    // logger.attachTransport(socketClient.log.bind(socketClient));
    logger.attachTransport(logSyslogTransport);

    const filename =
        settings.filename ?? path.resolve(__dirname, "../logs/stdout.log");
    try {
        const dir = path.dirname(filename);
        mkdirSync(dir, { recursive: true });
    } catch {
        // noop
    }
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
        const { message, logMeta } = parseLogObj(logObject);
        let parentString = logMeta.parentNames?.join(":") || "";
        if (parentString) {
            parentString = `${parentString}:`;
        }

        const line = `${logMeta.date.toISOString()} - ${
            logMeta.logLevelName
        }: [${parentString}${
            logMeta.name ?? "root"
        }] ${message} @${shortFilePathLineCol(logMeta)}\n`;
        stream.write(line, "utf8");
    }
    
    function stdoutTransport(logObject: ILogObj) {
        const { message, logMeta } = parseLogObj(logObject);
        if (logMeta.logLevelId >= 2) {
            console.log(
                `${logMeta.name} [${
                    logMeta.logLevelName
                }] - ${message} @ ${shortFilePathLineCol(logMeta)}`
            );
        }
    }

    return logger;
}

export type { Logger };
