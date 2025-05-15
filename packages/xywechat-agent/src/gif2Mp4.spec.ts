import { FileBox } from "file-box"
import { gif2Mp4 } from './gif2Mp4';
import path from "path";

describe('gif 2 mp4', () => {
    it('should convert', async () => {
        const p = path.resolve(__dirname, './fixture/test.gif');
        const gif = FileBox.fromFile(p);
        const mp4 = await gif2Mp4(gif);
        // await mp4.toFile(path.resolve(__dirname, './fixture/test.mp4'), true);
        expect(mp4.size).toBeTruthy();
    });
});