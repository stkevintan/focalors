import fs from "fs";

export function mkdirp(filePath: string): boolean {
    try {
        fs.mkdirSync(filePath, { recursive: true });
        return true;
    } catch {
        return false;
    }
}
