import path from "path";
import { createLogger } from "@focalors/logger";

export const logger = createLogger({
    name: "wechat-bridge",
    filename: path.resolve(__dirname, "../logs/stdout"),
});
