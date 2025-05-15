import fs from "fs";
import path from "path";

// Utility function to read JSON files
export const readJsonFile = (filePath: string): any => {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
};

// Utility function to write JSON files
export const writeJsonFile = (filePath: string, data: any): void => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

export function mkdirp(filePath: string): boolean {
    try {
        fs.mkdirSync(filePath, { recursive: true });
        return true;
    } catch {
        return false;
    }
}
