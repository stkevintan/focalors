import pino from "pino";
import type { LokiOptions } from "pino-loki";
import * as dotenv from "dotenv";
dotenv.config();

const loki = process.env["LOKIE_ENDPOINT"]
    ? {
          target: "pino-loki",
          options: {
              host: process.env["LOKIE_ENDPOINT"],
          } satisfies LokiOptions,
          level: "trace",
      }
    : undefined;

export const rootLogger = pino({
    name: "focalors",
    level: 'trace',
    transport: {
        targets: [
            {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    messageFormat: "[{module}] {msg}",
                    ignore: "pid,hostname,module",
                },
                level: "info",
            },
            loki,
        ].filter(<T>(t: T | undefined): t is T => !!t),
    },
});

export function createLogger(name: string): pino.Logger {
    return rootLogger.child({
        module: name,
    });
}

export type Logger = pino.Logger;
