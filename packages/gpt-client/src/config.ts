import fs from "fs";
import { singleton } from "tsyringe";
import { Configuration as BaseConfiguration } from "@focalors/onebot-protocol";
import path from "path";
import { logger } from "./logger";

const envPath = path.resolve(process.cwd(), ".env");

@singleton()
export class Configuration extends BaseConfiguration {
    override readonly botId = "GPT";
    endpoint = process.env["OPENAI_ENDPOINT"];
    deployment = process.env["OPENAI_DEPLOYMENT"];
    apiKey = process.env["OPENAI_APIKEY"];
    apiVersion = "2023-12-01-preview";
    masterId = process.env["MASTER_ID"];
    redisUri = process.env["REDIS_URI"];
    tokenLimit = 100;
    get allowIdentities(): Set<string> {
        return new Set(
            (process.env["OPENAI_ALLOW_IDENTITIES"] ?? "")
                .split(",")
                .map((s) => s.trim())
        );
    }

    addIdentity(id: string) {
        const identities = this.allowIdentities;
        identities.add(id);
        this.setIdentities(identities);
    }

    delIdentity(id: string) {
        const identities = this.allowIdentities;
        identities.delete(id);
        this.setIdentities(identities);
    }

    setIdentities(set: Set<string>) {
        const str = Array.from(set.values()).join(",");
        process.env["OPENAI_ALLOW_IDENTITIES"] = str;
    }

    async syncToDisk() {
        try {
            const syncKeys = ["OPENAI_ALLOW_IDENTITIES"];
            let env = await fs.promises.readFile(envPath, "utf8");
            for (const key of syncKeys) {
                if (process.env[key]) {
                    env = env.replace(
                        new RegExp(`${key}\\s*=\\s*".*"`),
                        `${key}="${process.env[key]}"`
                    );
                }
            }
            await fs.promises.writeFile(envPath, env);
            logger.info("Successfully sync env into disk");
        } catch (err) {
            logger.error("Sync configuration to disk error:", err);
        }
    }
}
