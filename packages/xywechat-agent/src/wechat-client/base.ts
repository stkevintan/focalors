import { inject, injectable } from "tsyringe";
import { XYWechatConfiguration } from "../config";
import {
    MMTLSError,
    PacketError,
    ParsePacketError,
    DatabaseError,
    UserLoggedOut,
    MarshallingError,
    UnmarshallingError,
} from "./errors";
export interface JsonResponse {
    [key: string]: any;
}

export class NetProxy {
    /**
     * Proxy (No effect, do not use!)
     *
     * @param ip Proxy server IP address
     * @param port Proxy server port
     * @param username Proxy authentication username, default is an empty string
     * @param password Proxy authentication password, default is an empty string
     */
    constructor(
        public ip: string,
        public port: number,
        public username: string = "",
        public password: string = ""
    ) {}
}

export class Section {
    /**
     * Data segment configuration class
     *
     * @param dataLen Data length
     * @param startPos Start position
     */
    constructor(public dataLen: number, public startPos: number) {}
}

@injectable()
export class WechatClientBase {
    wxid: string | undefined;
    nickname: string | undefined;
    alias: string | undefined;
    phone: string | undefined;

    constructor(
        @inject(XYWechatConfiguration) private config: XYWechatConfiguration
    ) {}

    get baseURL(): string {
        return `http://${this.config.hostIP}:${this.config.hostPort}`;
    }

    createURL(path: string): URL {
        return new URL(path, this.baseURL);
    }

    async send(path: string, jsonParam: any): Promise<any> {
        const response = await fetch(this.createURL(path), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(jsonParam),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const json = await response.json();
        if (json?.Success) {
            const data = { ...json?.Data };
            delete data["BaseResponse"];
            return data;
        } else {
            globalErrorHandler(json);
        }
    }
}

/**
 * Handles error codes in API responses
 *
 * @param jsonResp API response JSON data
 * @throws Various exceptions based on error codes
 */
function globalErrorHandler(jsonResp: JsonResponse): never {
    const code = jsonResp["Code"];
    switch (code) {
        case -1:
            throw new Error(jsonResp["Message"]); // Parameter error
        case -2:
            throw new Error(jsonResp["Message"]); // Other errors
        case -3:
            throw new MarshallingError(jsonResp["Message"]); // Serialization error
        case -4:
            throw new UnmarshallingError(jsonResp["Message"]); // Deserialization error
        case -5:
            throw new MMTLSError(jsonResp["Message"]); // MMTLS initialization error
        case -6:
            throw new PacketError(jsonResp["Message"]); // Packet length error
        case -7:
            throw new UserLoggedOut("Already logged out"); // Logged out
        case -8:
            throw new Error(jsonResp["Message"]); // Link expired
        case -9:
            throw new ParsePacketError(jsonResp["Message"]); // Packet parsing error
        case -10:
            throw new DatabaseError(jsonResp["Message"]); // Database error
        case -11:
            throw new UserLoggedOut(jsonResp["Message"]); // Login exception
        case -12:
            throw new Error(jsonResp["Message"]); // Too frequent operations
        case -13:
            throw new Error(jsonResp["Message"]); // Upload failed
        default:
            throw new Error("Unknown error code");
    }
}
