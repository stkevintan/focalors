import * as fs from "fs";
import * as path from "path";
import { createLogger } from "@focalors/logger";
import { inject, injectable } from "tsyringe";
import { WechatClient } from "../wechat-client";
import { XYWechatConfiguration } from "../config";
import { AsyncService } from "@focalors/onebot-protocol";
import { WechatHost } from "../wechat-host";
import { LoginService } from "../wechat-client/login";
import { MessageParser } from "./message-parser";
import { readJsonFile, writeJsonFile } from "../utils";

// Logging configuration
const logger = createLogger("XYWechat-Bot");

@injectable()
export class XYWechatBot implements AsyncService {
    constructor(
        @inject(XYWechatConfiguration)
        private configuration: XYWechatConfiguration,
        @inject(WechatHost) private host: WechatHost,
        @inject(WechatClient) private client: WechatClient,
        @inject(MessageParser) private botMessage: MessageParser
    ) {}

    private abortController = new AbortController();

    async start(): Promise<void> {
        try {
            // Set working directory
            const scriptDir = __dirname;

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
            let timeout = 10;
            while (!(await this.client.isRunning()) && timeout > 0) {
                logger.info("Waiting for WechatClient to start...");
                await new Promise((resolve) => setTimeout(resolve, 2000));
                timeout -= 2;
            }

            if (timeout <= 0) {
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
            const robotStatPath = path.join(
                scriptDir,
                "resource",
                "robot_stat.json"
            );
            let robotStat: {
                wxid: string;
                deviceName: string;
                deviceId: string;
            } = { wxid: "", deviceName: "", deviceId: "" };

            if (!fs.existsSync(robotStatPath)) {
                writeJsonFile(robotStatPath, robotStat);
            } else {
                robotStat = readJsonFile(robotStatPath);
            }

            let { wxid, deviceName, deviceId } = robotStat;

            if (await this.client.user.isLoggedIn(wxid)) {
                const profile = await this.client.user.getProfile();
                logger.info(`Logged in profile: ${JSON.stringify(profile)}`);
            }

            while (!(await this.client.user.isLoggedIn(wxid))) {
                try {
                    if (await this.client.loginService.getCachedInfo(wxid)) {
                        const uuid = await this.client.loginService.awakenLogin(
                            wxid
                        );
                        logger.info(`Login UUID obtained: ${uuid}`);
                    } else {
                        deviceName =
                            LoginService.createDeviceName() || deviceName;
                        deviceId = LoginService.createDeviceId() || deviceId;
                        const [uuid, url, qr] =
                            await this.client.loginService.getQrCode(
                                deviceId,
                                deviceName
                            );
                        logger.info(`Login UUID: ${uuid}`);
                        logger.info(`Login QR Code: ${url}`);
                        // botBridge.saveProfile({ avatarUrl: url });
                        logger.info(`\n${qr}`);
                    }
                } catch {
                    // TODO: dedupe
                    deviceName = LoginService.createDeviceName() || deviceName;
                    deviceId = LoginService.createDeviceId() || deviceId;
                    const [uuid, url, qr] =
                        await this.client.loginService.getQrCode(
                            deviceId,
                            deviceName
                        );
                    logger.info(`Login UUID: ${uuid}`);
                    logger.info(`Login QR Code: ${url}`);
                    // botBridge.saveProfile({ avatarUrl: url });
                    logger.info(`\n${qr}`);
                }
                while (true) {
                    const ret = await this.client.loginService.checkLoginUuid(
                        wxid
                    );
                    if (ret[0]) {
                        break;
                    }
                    logger.info("等待登录中，过期倒计时：%s", ret[1]);
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                }
            }

            robotStat.wxid = this.client.wxid ?? "";
            robotStat.deviceName = deviceName;
            robotStat.deviceId = deviceId;
            writeJsonFile(robotStatPath, robotStat);

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

            // Initialize bot
            // const xybot = new XYBot(bot);
            // xybot.updateProfile(bot.wxid, bot.nickname, bot.alias, bot.phone);

            // Process messages
            // const keyvalDb = new KeyvalDB();
            // await keyvalDb.set("start_time", Date.now().toString());

            logger.info("Handling accumulated messages...");
            let count = 0;
            while (true) {
                const data = await this.client.message.syncMessage();
                const messages = data?.AddMsgs || [];

                if (!messages.length) {
                    if (count > 2) break;
                    count++;
                    continue;
                }

                logger.debug(`Received ${messages.length} messages`);
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            logger.info("Finished handling accumulated messages");

            // Start processing new messages
            
            while (true) {
                try {
                    const data = await this.client.message.syncMessage();
                    const messages = data?.AddMsgs || [];
                    for (const message of messages) {
                        await this.botMessage.createMessage(message);
                    }
                    await new Promise((resolve) => setTimeout(resolve, 500));
                } catch (e: any) {
                    logger.warn(`Failed to fetch new messages: ${e.message}`);
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                }
            }
        } catch (e: any) {
            logger.error(`Bot runtime error: ${e.message}`);
        }
    }

    async stop(): Promise<void> {
        try {
            await this.client.loginService.startAutoHeartbeat();
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
