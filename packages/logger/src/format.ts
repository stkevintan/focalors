import path from "path";
import { ILogObj, IMeta } from "tslog";
import { format } from "util";

export function parseLogObj(obj: ILogObj) {
    const { _meta, ...messages } = obj as ILogObj & {
        _meta: IMeta;
        nativeError?: Error;
    };
    if (messages.nativeError) {
        const e = messages.nativeError;
        return {
            message: e instanceof Error ? `Error: ${e.stack}` : `${e}`,
            logMeta: _meta,
        };
    }

    const arr = Array.from({
        ...messages,
        length: Object.keys(messages).length,
    });

    return {
        message: formatLogObj(arr),
        logMeta: _meta,
    };
}

function formatLogObj(arr: unknown[]) {
    return arr
        .map((str) => {
            try {
                return typeof str === "object" && str !== null
                    ? JSON.stringify(str)
                    : str;
            } catch {
                return format(str);
            }
        })
        .join(" ");
}
export function shortFilePathLineCol(logMeta: IMeta) {
    return path.relative(process.cwd(), logMeta?.path?.fullFilePath ?? "");
}
