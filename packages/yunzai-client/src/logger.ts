import path from "path";
import { createLogger } from "@focalors/logger";

export const logger = createLogger({
    name: "yunzai-client",
    filename: path.resolve(__dirname, "../logs/stdout"),
});
