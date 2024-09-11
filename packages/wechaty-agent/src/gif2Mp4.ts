import { createLogger } from "@focalors/logger";
import { FileBox } from "file-box";
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from "stream";

const logger = createLogger('gif-2-mp4');
export async function gif2Mp4(filebox: FileBox): Promise<FileBox> {
    const command = ffmpeg(await filebox.toStream());
    const passThru = new PassThrough();

    const mp4 = FileBox.fromStream(passThru, `video.mp4`);
    command.noAudio()
        .output(passThru)
        .on('end', () => {
            logger.info("gif converted");
        });
    return mp4;
}