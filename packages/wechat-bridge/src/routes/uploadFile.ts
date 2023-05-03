import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Protocol } from "@focalors/yunzai-client";
import { Configuration } from "src/config";
import { TOKENS } from "src/tokens";
import { inject } from "tsyringe";
import { Wechaty } from "wechaty";
import { logger } from "src/logger";

export class UploadFileRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.UploadFileAction>
{
    constructor(
        @inject(Configuration) private configuration: Configuration,
        @inject(TOKENS.wechaty) private bot: Wechaty
    ) {}
    readonly action = "upload_file";
    async handle(
        req: Protocol.UploadFileAction[0]
    ): Promise<Protocol.UploadFileAction[1]> {
        const file = req.params;
        const dir = this.configuration.imageCacheDirectory;
        const name = randomUUID();
        const imagePath = path.resolve(dir, `${name}.jpg`);
        // currently we only handle data
        if (file.type === "data") {
            await fs.promises.writeFile(imagePath, file.data, "base64");
            logger.info("successfully write image cache into:", imagePath);
        }
        return {
            echo: req.echo,
            data: {
                file_id: name,
            },
        };
    }
}
