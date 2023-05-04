import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { Protocol } from "@focalors/yunzai-client";
import { Configuration } from "../config";
import { inject, injectable } from "tsyringe";
import { logger } from "../logger";
import { FileBox } from "file-box";

const interval = 30 * 60 * 1000;

@injectable()
export class UploadFileRouteHandler
    implements Protocol.ActionRouteHandler<Protocol.UploadFileAction>
{
    constructor(@inject(Configuration) private configuration: Configuration) {
        setInterval(() => {
            void this.removeHoursAgo();
        }, interval);
    }
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

    private async removeHoursAgo() {
        const dir = this.configuration.imageCacheDirectory;
        try {
            const images = await fs.promises.readdir(dir);
            logger.debug("starting to remove outdated images");
            const ret = await Promise.allSettled(
                images.map(async (image) => {
                    const extname = path.extname(image);
                    if (extname === ".jpg") {
                        const fullpath = path.resolve(dir, image);
                        const stat = await fs.promises.stat(fullpath);
                        if (Date.now() - stat.atimeMs >= interval) {
                            await fs.promises.unlink(fullpath);
                        }
                    }
                })
            );
            logger.debug(
                `removed ${
                    ret.filter((r) => r.status === "fulfilled").length
                } outdated images`
            );
        } catch (err) {}
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
