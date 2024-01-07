import { AsyncService } from "@focalors/onebot-protocol";
import nano from "nanomsg";
import { inject, singleton } from "tsyringe";
import { WcfConfiguration } from "../config";
import { logger } from "../logger";
import { wcf } from "./wcf";

@singleton()
export class WcfNativeClient implements AsyncService {
    private socket: nano.Socket;
    constructor(
        @inject(WcfConfiguration) private configuration: WcfConfiguration
    ) {
        this.socket = nano.createSocket("pair", {
            // rcvtimeo: 5000,
            // sndtimeo: 5000,
            // dontwait: true,
        });
    }

    get state() {
        return this.socket.connected;
    }

    getConnUrl(rev = false) {
        const url = `tcp://${this.configuration.wcfProto.host}:${
            this.configuration.wcfProto.port + (rev ? 1 : 0)
        }`;
        logger.info("wcf native url:", url);
        return url;
    }
    async start(): Promise<void> {
        try {
            this.socket.connect(this.getConnUrl());
        } catch (err) {
            logger.error("cannot connect to wcf RPC server");
            throw err;
        }
    }

    async stop(): Promise<void> {
        this.socket.close();
    }

    private async sendRequest(req: wcf.Request) {
        const data = req.serialize();
        this.socket.send(Buffer.from(data));
        const recv = await new Promise<Buffer>((res, rej) => {
            const bufs: Buffer[] = [];
            this.socket.on("data", (buf) => {
                bufs.push(buf);
            });
            this.socket.on("error", (err) => rej(err));
            this.socket.on("close", () => {
                res(Buffer.concat(bufs));
            });
        });
        const res = wcf.Response.deserialize(recv);
        return res;
    }

    /*
        def is_login(self) -> bool:
        """是否已经登录"""
        req = wcf_pb2.Request()
        req.func = wcf_pb2.FUNC_IS_LOGIN  # FUNC_IS_LOGIN
        rsp = self._send_request(req)

        return rsp.status == 1
        */
    async isLogin(): Promise<boolean> {
        const req = new wcf.Request();
        req.func = wcf.Functions.FUNC_IS_LOGIN;
        const rsp = await this.sendRequest(req);
        return rsp.status == 1;
    }
}
