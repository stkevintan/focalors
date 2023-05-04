import path from "path";
import { randomUUID } from "crypto";
import { Protocol } from "@focalors/yunzai-client";
import { Configuration } from "../config";
import { inject, injectable } from "tsyringe";
import { logger } from "../logger";
import { FileBox } from "file-box";

@injectable()
export class UploadFileRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.UploadFileAction>
{
    constructor(@inject(Configuration) private configuration: Configuration) {}
    readonly action = "upload_file";
    async handle(
        req: Protocol.UploadFileAction[0]
    ): Promise<Protocol.UploadFileAction[1]> {
        const file = req.params;
        const dir = this.configuration.imageCacheDirectory;
        const name = randomUUID();
        const imagePath = path.resolve(dir, `${name}.jpg`);
        const filebox = toFileBox(file, `${name}.jpg`);
        if (filebox) {
            logger.info("successfully write image cache into:", imagePath);
            await filebox.toFile(imagePath, true);
        }
        return {
            echo: req.echo,
            data: {
                file_id: name,
            },
        };
    }
}

function toFileBox(
    file: Protocol.UploadFileAction[0]["params"],
    name?: string
) {
    switch (file.type) {
        case "data":
            return FileBox.fromBase64(file.data, name);
        case "path":
            return FileBox.fromFile(file.path, name);
        case "url":
            return FileBox.fromUrl(file.url, { headers: file.headers, name });
    }
}
