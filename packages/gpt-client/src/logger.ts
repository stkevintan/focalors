import path from "path";
import { createLogger } from "@focalors/logger";

export const logger = createLogger({
    name: "gpt-client",
    filename: path.resolve(__dirname, "../logs/stdout"),
});
