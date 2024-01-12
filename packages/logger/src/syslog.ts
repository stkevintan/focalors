import syslog from "syslog-client";
import { ILogObj } from "tslog";
import { parseLogObj, shortFilePathLineCol } from "./format";

let client: syslog.Client | undefined = undefined;

function getClient(): syslog.Client | undefined {
    if (!client && process.env["SYSLOG_HOST"]) {
        client = syslog.createClient(process.env["SYSLOG_HOST"], {
            syslogHostname: "focarlors",
            transport: syslog.Transport.Udp,
            port: +(process.env["SYSLOG_PORT"] ?? 514),
        });
    }
    return client;
}

export function logSyslogTransport(logObject: ILogObj) {
    const client = getClient();
    if (!client) {
        console.log("No syslog client available");
        return;
    }
    const { message, logMeta } = parseLogObj(logObject);
    const sourceNames = [...(logMeta?.parentNames ?? []), logMeta?.name];
    const sourceName = sourceNames.filter((s) => s).join(":");

    const location = shortFilePathLineCol(logMeta);

    client.log(`${sourceName} ${message} @${location}`, {
        severity: convertSeverity(logMeta?.logLevelName),
        timestamp: logMeta?.date,
        facility: syslog.Facility.User,
        // appName: sourceName,
    });
}

function convertSeverity(logLevel?: string): syslog.Severity {
    switch (logLevel) {
        case "WARN":
            return syslog.Severity.Warning;
        case "ERROR":
            return syslog.Severity.Error;
        case "FATAL":
            return syslog.Severity.Critical;
        case "INFO":
            return syslog.Severity.Informational;
        case "TRACE":
        case "SILLY":
        case "DEBUG":
        default:
            return syslog.Severity.Debug;
    }
}
