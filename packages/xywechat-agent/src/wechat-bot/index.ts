import * as fs from "fs";
import * as path from "path";
import { createLogger } from "@focalors/logger";
import { inject, injectable } from "tsyringe";
import { WechatClient } from "../wechat-client";
import { XYWechatConfiguration } from "../config";
import { AsyncService, RedisClient } from "@focalors/onebot-protocol";
import { WechatHost } from "../wechat-host";
import { LoginService } from "../wechat-client/login";
import { MessageParser } from "./message-parser";
import { readJsonFile, writeJsonFile } from "../utils";

// Logging configuration
const logger = createLogger("XYWechat-Bot");

interface RobotStat {
    wxid: string;
    deviceName: string;
    deviceId: string;
}
@injectable()
export class XYWechatBot implements AsyncService {
    constructor(
        @inject(XYWechatConfiguration)
        private configuration: XYWechatConfiguration,
        @inject(WechatHost) private host: WechatHost,
        @inject(WechatClient) private client: WechatClient,
        @inject(MessageParser) private messageHandler: MessageParser,
        @inject(RedisClient) private redis: RedisClient
    ) {}

    private abortController = new AbortController();

    private waitFor(ms: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const onabort = () => reject(new Error(`Aborted`));
            this.abortController.signal.addEventListener("abort", onabort);
            setTimeout(() => {
                this.abortController.signal.removeEventListener(
                    "abort",
                    onabort
                );
                resolve();
            }, ms);
        });
    }

    async start(): Promise<void> {
        try {
            // Read main configuration
            logger.info("Main configuration loaded successfully");
            const redisUri = this.configuration.redisUri; // redis://localhost:6379
            // get redis host and port
            const parased = new URL(redisUri);
            const redisHost = parased.hostname || "127.0.0.1";
            const redisPort = parseInt(parased.port || "6379");
            const redisDB = parased.pathname
                ? parseInt(parased.pathname.replace(/^\//, ""))
                : 0;

            await this.host.start();
            logger.debug(`Redis Host: ${redisHost}:${redisPort}/${redisDB}`);
            await this.host.start(
                this.configuration.hostPort,
                this.configuration.hostMode,
                redisHost,
                redisPort,
                "",
                redisDB
            );
            // Wait for WechatAPI server to start
            let timeCount = 10;
            while (
                !this.abortController.signal.aborted &&
                !(await this.client.isRunning()) &&
                timeCount > 0
            ) {
                logger.info("Waiting for WechatClient to start...");
                await this.waitFor(2000);
                timeCount -= 2;
            }

            if (timeCount <= 0) {
                logger.error("WechatClient service startup timed out");
                return;
            }

            if (!(await this.client.checkDatabase())) {
                logger.error(
                    "Failed to connect to Redis. Please check Redis configuration."
                );
                return;
            }

            logger.info("WechatClient service started successfully");
            // Login logic
            let robotStat = await this.redis.get<Partial<RobotStat>>(
                "robot_stat"
            );
            robotStat = robotStat || {};

            while (
                !this.abortController.signal.aborted &&
                !(await this.client.user.isLoggedIn(robotStat.wxid))
            ) {
                const uuid = await this.getLoginUUID(robotStat);
                while (!this.abortController.signal.aborted) {
                    // this.client.wxid will be set if checkLoginUuid is successful
                    const ret = await this.client.loginService.checkLoginUuid(
                        uuid
                    );
                    if (ret[0]) {
                        break;
                    }
                    robotStat.wxid = this.client.wxid!;

                    logger.info("等待登录中，过期倒计时：%s", ret[1]);
                    await this.waitFor(5000);
                }
            }

            // if the client is logged in at first place, then this.client.wxid will be unset
            if (this.client.wxid == null) {
                const profile = await this.client.user.getProfile();
                this.client.wxid = profile.wxid;
                this.client.nickname = profile.nickname;
                robotStat.wxid = profile.wxid;
                logger.info(`Logged in profile: ${JSON.stringify(profile)}`);
            }

            this.messageHandler.updateProfile({
                wxid: this.client.wxid,
                nickname: this.client.nickname!,
            });

            await this.redis.set("robot_stat", robotStat);

            logger.info(`Logged in as wxid: ${robotStat.wxid}`);

            logger.info("Login successful");

            // Start auto heartbeat
            try {
                const success =
                    await this.client.loginService.startAutoHeartbeat();
                if (success) {
                    logger.info("Auto heartbeat started successfully");
                } else {
                    logger.warn("Failed to start auto heartbeat");
                }
            } catch (e: any) {
                logger.warn(`Auto heartbeat error: ${e.message}`);
            }

            logger.info("Handling accumulated messages...");
            let count = 0;
            while (!this.abortController.signal.aborted) {
                const data = await this.client.message.syncMessage();
                const messages = data?.AddMsgs || [];

                if (!messages.length) {
                    if (count > 2) break;
                    count++;
                    continue;
                }

                logger.debug(`Received ${messages.length} messages`);
                await this.waitFor(1000);
            }

            logger.info("Finished handling accumulated messages");

            // Start processing new messages

            while (!this.abortController.signal.aborted) {
                try {
                    const data = await this.client.message.syncMessage();
                    const messages = data?.AddMsgs || [];
                    for (const message of messages) {
                        await this.messageHandler.handle(message);
                    }
                    await this.waitFor(500);
                } catch (e: any) {
                    logger.warn(`Failed to fetch new messages: ${e.message}`);
                    await this.waitFor(5000);
                }
            }
        } catch (e: any) {
            logger.error(`Bot runtime error: ${e.message}`);
        }
    }

    private async getLoginUUID(robotStat: Partial<RobotStat>): Promise<string> {
        if (
            await this.client.loginService
                .getCachedInfo(robotStat.wxid)
                .catch(() => false)
        ) {
            try {
                const uuid = await this.client.loginService.awakenLogin(
                    robotStat?.wxid
                );
                logger.info(`Login UUID obtained from cache: ${uuid}`);
                return uuid;
            } catch {}
        }
        robotStat.deviceName ??= LoginService.createDeviceName();
        robotStat.deviceId ??= LoginService.createDeviceId();
        const [uuid, url, qr] = await this.client.loginService.getQrCode(
            robotStat.deviceId,
            robotStat.deviceName
        );
        logger.info(`Login UUID: ${uuid}`);
        logger.info(`Login QR Code: ${url}`);
        // botBridge.saveProfile({ avatarUrl: url });
        logger.info(`\n` + qr);
        return uuid;
    }

    async stop(): Promise<void> {
        try {
            this.abortController.abort();
            await this.client.loginService.stopAutoHeartbeat();
        } finally {
            await this.host.stop();
        }
    }
}

// // System initialization
// const initSystem = async (): Promise<void> => {
//     logger.info("Initializing system...");
//     const xybotDb = new XYBotDB();
//     const messageDb = new MessageDB();
//     const keyvalDb = new KeyvalDB();

//     await messageDb.initialize();
//     await keyvalDb.initialize();
//     await keyvalDb.delete("start_time");

//     logger.info("Database initialized successfully");
// };
