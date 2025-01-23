import os from "os";
import { createLogger } from "@focalors/logger";
import { FileBox, FileBoxType } from "file-box";
import ffmpeg from "fluent-ffmpeg";
import { Writable } from "stream";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobe from "@ffprobe-installer/ffprobe";
import path from "path";
import { randomUUID } from "crypto";
import { rm } from "fs/promises";
import { inspect } from "util";
import { existsSync } from "fs";

const logger = createLogger("gif-2-mp4");
export async function gif2Mp4(fileBox: FileBox): Promise<FileBox> {
    const [localPath, inTmpDir] = await getLocalPath(fileBox);
    logger.info(`gif2mp4 => converting ${localPath} to mp4`);
    try {
        const command = ffmpeg(localPath)
            .setFfmpegPath(ffmpegInstaller.path)
            .setFfprobePath(ffprobe.path);
        logger.info(
            "gif2mp4 => command:",
            command,
            ffmpegInstaller.path,
            ffprobe.path,
            existsSync(ffmpegInstaller.path)
        );

        const stream = new FileBoxStream();
        command
            .inputFormat("gif")
            .noAudio()
            // .outputOptions([
            //     "-pix_fmt yuv420p",
            //     "-c:v libx264",
            //     "-movflags +faststart",
            //     "-filter:v crop='floor(in_w/2)*2:floor(in_h/2)*2'",
            // ])
            // https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/967#issuecomment-888843722
            .outputOptions("-movflags frag_keyframe+empty_moov")
            .toFormat("mp4")
            .on("error", (e) => {
                logger.error(`Converting gif to mp4 failed: ${inspect(e)}`);
            })
            .pipe(stream);

        return await stream.toFileBox(`${new Date().toLocaleDateString()}.mp4`);
    } finally {
        if (inTmpDir) {
            rm(localPath, { force: true }).catch();
        }
    }
}

async function getLocalPath(filebox: FileBox): Promise<[string, boolean]> {
    if (filebox.type === FileBoxType.File) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return [(filebox as any).localPath, false];
    }
    const localPath = path.resolve(os.tmpdir(), `${randomUUID()}.gif`);
    await filebox.toFile(localPath, true);
    return [localPath, true];
}

class FileBoxStream extends Writable {
    private ok: () => void = () => {};
    private err: (e: Error) => void = () => {};
    private defer = new Promise<void>((res, rej) => {
        this.ok = res;
        this.err = rej;
    });

    constructor() {
        super();
    }

    private buffer: Buffer[] = [];
    override _write(
        chunk: Buffer,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void
    ): void {
        this.buffer.push(chunk);
        callback();
    }
    override end() {
        super.end();
        this.ok();
        logger.info(`write end: ${this.buffer.length}`);
        return this;
    }

    override destroy(error?: Error | undefined): this {
        this.err(error ?? new Error("destroyed"));
        return this;
    }

    async toFileBox(name: string): Promise<FileBox> {
        await this.defer;
        return FileBox.fromBuffer(Buffer.concat(this.buffer), name);
    }
}
