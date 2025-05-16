import { NetProxy, WechatClientBase } from "./base";
import * as qrcode from "qrcode-terminal";
import { v4 as uuidv4 } from "uuid";
import { LoginError } from "./errors";
import { Dict } from "./types";
import { inject, injectable } from "tsyringe";

@injectable()
export class LoginService {
    constructor(@inject(WechatClientBase) private client: WechatClientBase) {}

    async isRunning(): Promise<boolean> {
        try {
            const text = await fetch(this.client.createURL("IsRunning")).then(
                (res) => res.text()
            );
            return text === "OK";
        } catch {
            return false;
        }
    }

    async getQrCode(
        deviceName: string,
        deviceId?: string,
        proxy?: NetProxy
    ): Promise<[UUID: string, URL: string, QRCode: string]> {
        const jsonParam: any = {
            DeviceName: deviceName,
            DeviceID: deviceId ?? "",
        };
        if (proxy) {
            jsonParam.ProxyInfo = {
                ProxyIp: `${proxy.ip}:${proxy.port}`,
                ProxyPassword: proxy.password,
                ProxyUser: proxy.username,
            };
        }

        const data = await this.client.send("GetQRCode", jsonParam);
        const qr = await new Promise<string>((res) =>
            qrcode.generate(
                `http://weixin.qq.com/x/${data.Uuid}`,
                undefined,
                (code) => res(code)
            )
        );

        return [data.Uuid, data.QRCodeURL, qr];
    }

    async checkLoginUuid(
        uuid: string
    ): Promise<[ok: true, userInfo: Dict] | [ok: false, expiredTime: number]> {
        const jsonParam = { Uuid: uuid };
        const data = await this.client.send("CheckUuid", jsonParam);

        if (data.acctSectResp) {
            this.client.wxid = data.acctSectResp.userName;
            this.client.nickname = data.acctSectResp.nickName;
            return [true, data];
        } else {
            return [false, data.expiredTime];
        }
    }

    async logOut(): Promise<boolean> {
        if (!this.client.wxid) {
            throw new Error("Please login first");
        }

        const jsonParam = { Wxid: this.client.wxid };
        await this.client.send("Logout", jsonParam);
        this.client.wxid = undefined;
        this.client.nickname = undefined;
        return true;
    }

    async awakenLogin(wxid?: string): Promise<string> {
        if (!wxid && !this.client.wxid) {
            throw new Error("Please login using QRCode first");
        }
        const jsonParam = { Wxid: wxid ?? this.client.wxid };
        const jsonResp = await this.client.send("AwakenLogin", jsonParam);

        if (!jsonResp.QrCodeResponse?.Uuid) {
            throw new LoginError("Please login using QRCode first");
        }

        return jsonResp.QrCodeResponse.Uuid;
    }

    async getCachedInfo(wxid?: string): Promise<Dict> {
        if (!wxid && !this.client.wxid) {
            throw new Error("No wxid available");
        }

        const jsonParam = { Wxid: wxid ?? this.client.wxid };
        return await this.client.send("GetCachedInfo", jsonParam);
    }

    async heartbeat(): Promise<boolean> {
        if (!this.client.wxid) {
            throw new Error("Please login first");
        }

        const jsonParam = { Wxid: this.client.wxid };
        await this.client.send("Heartbeat", jsonParam);
        return true;
    }

    async startAutoHeartbeat(): Promise<boolean> {
        if (!this.client.wxid) {
            throw new Error("Please login first");
        }

        const jsonParam = { Wxid: this.client.wxid };
        await this.client.send("AutoHeartbeatStart", jsonParam);
        return true;
    }

    async stopAutoHeartbeat(): Promise<boolean> {
        if (!this.client.wxid) {
            throw new Error("Please login first");
        }

        const jsonParam = { Wxid: this.client.wxid };
        await this.client.send("AutoHeartbeatStop", jsonParam);
        return true;
    }

    async getAutoHeartbeatStatus(): Promise<boolean> {
        if (!this.client.wxid) {
            throw new Error("Please login first");
        }

        const jsonParam = { Wxid: this.client.wxid };
        const jsonResp = await this.client.send(
            "AutoHeartbeatStatus",
            jsonParam
        );
        return jsonResp.Running;
    }

    static createDeviceName(): string {
        const firstNames = [
            "Oliver",
            "Emma",
            "Liam",
            "Ava",
            "Noah",
            "Sophia",
            "Elijah",
            "Isabella",
            "James",
            "Mia",
            "William",
            "Amelia",
            "Benjamin",
            "Harper",
            "Lucas",
            "Evelyn",
            "Henry",
            "Abigail",
            "Alexander",
            "Ella",
            "Jackson",
            "Scarlett",
            "Sebastian",
            "Grace",
            "Aiden",
            "Chloe",
            "Matthew",
            "Zoey",
            "Samuel",
            "Lily",
            "David",
            "Aria",
            "Joseph",
            "Riley",
            "Carter",
            "Nora",
            "Owen",
            "Luna",
            "Daniel",
            "Sofia",
            "Gabriel",
            "Ellie",
            "Matthew",
            "Avery",
            "Isaac",
            "Mila",
            "Leo",
            "Julian",
            "Layla",
        ];

        const lastNames = [
            "Smith",
            "Johnson",
            "Williams",
            "Brown",
            "Jones",
            "Garcia",
            "Miller",
            "Davis",
            "Rodriguez",
            "Martinez",
            "Hernandez",
            "Lopez",
            "Gonzalez",
            "Wilson",
            "Anderson",
            "Thomas",
            "Taylor",
            "Moore",
            "Jackson",
            "Martin",
            "Lee",
            "Perez",
            "Thompson",
            "White",
            "Harris",
            "Sanchez",
            "Clark",
            "Ramirez",
            "Lewis",
            "Robinson",
            "Walker",
            "Young",
            "Allen",
            "King",
            "Wright",
            "Scott",
            "Torres",
            "Nguyen",
            "Hill",
            "Flores",
            "Green",
            "Adams",
            "Nelson",
            "Baker",
            "Hall",
            "Rivera",
            "Campbell",
            "Mitchell",
            "Carter",
            "Roberts",
            "Gomez",
            "Phillips",
            "Evans",
        ];

        return `${choice(firstNames)} ${choice(lastNames)}'s Pad`;
    }

    static createDeviceId(seed: string = ""): string {
        if (!seed) {
            seed = uuidv4();
        }
        return `49${Buffer.from(seed).toString("hex").slice(0, 14)}`;
    }
}
function choice(choices: string[]): string {
    return choices[Math.floor(Math.random() * choices.length)];
}
