import {
    matchPattern,
    MessageSegment,
    MessageTarget2,
    OnebotClient,
} from "@focalors/onebot-protocol";
import { randomUUID } from "crypto";
import { injectable } from "tsyringe";

@injectable()
export class GifClient extends OnebotClient {
    async recv(
        message: MessageSegment[],
        from: MessageTarget2
    ): Promise<boolean> {
        return await this.gif(message, from);
    }

    private async gif(
        message: MessageSegment[],
        from: MessageTarget2
    ): Promise<boolean> {
        const ret = matchPattern(message, /^\/gif\s*(\w+)\s+(.*)\s*$/);
        const sendUsage = () =>
            this.sendText(
                `Usage: /gif <name> <line1>,<line2>,...\nPS: get <name> from: https://sorry.xuty.cc/<name>`,
                from
            );
        if (ret?.[1]) {
            const url = `https://sorry.xuty.cc/${ret[1]}/make`;
            const body = ret[2]
                ? Object.fromEntries(
                      ret[2].split(",").map((t, i) => [i, t] as const)
                  )
                : {};
            const resp = await fetch(url, {
                method: "POST",
                body: JSON.stringify(body),
            });
            try {
                const text = await resp.text();
                /*
                <p>
                    <a href="/cache/edcbe646b8b0a9d83f0675b9545c745b.gif" target="_blank">
                        <p>点击下载</p>
                    </a>
                </p>
                */
                const matchRet = text.match(/href\s*=\s*"(.*\.gif)"/);
                if (matchRet?.[1]) {
                    this.sendFile(
                        {
                            type: "url",
                            url: `https://sorry.xuty.cc/${matchRet[1]}`,
                            name: `${randomUUID()}.gif`,
                        },
                        from
                    );
                } else {
                    sendUsage();
                }
            } catch (err) {
                console.error("make gif erorr:", err);
            }
            return true;
        }
        if (matchPattern(message, /^\/gif/)) {
            sendUsage();
            return true;
        }
        return false;
    }
}
