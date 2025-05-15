import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as path from "path";
import fs from "fs";
import { createLogger } from "@focalors/logger";
import { injectable } from "tsyringe";

const logger = createLogger("wechat-host");

@injectable()
export class WechatHost {
    private executablePath: string;
    private process: ChildProcessWithoutNullStreams | null = null;

    constructor() {
        this.executablePath = this.findExecutableFolder(
            path.resolve(__dirname, "core")
        );
        if (!fs.existsSync(this.executablePath)) {
            throw new Error(
                `Executable not found at path: ${this.executablePath}`
            );
        }
    }

    private findExecutableFolder(root: string): string {
        switch (`${process.platform}-${process.arch}` as const) {
            case "win32-x64":
                return path.resolve(root, "win_x64", "XYWechatPad.exe");
            case "linux-x64":
                return path.resolve(root, "linux_x64", "XYWechatPad");
            case "linux-arm64":
                return path.resolve(root, "linux_aarch64", "XYWechatPad");
            case "darwin-x64":
                return path.resolve(root, "macos_x64", "XYWechatPad");
            case "darwin-arm64":
                return path.resolve(root, "macos_arm64", "XYWechatPad");
            default:
                throw new Error(
                    `Unsupported platform: ${process.platform} and arch: ${process.arch}`
                );
        }
    }

    async start(
        port: number = 9000,
        mode: string = "release",
        redisHost: string = "127.0.0.1",
        redisPort: number = 6379,
        redisPassword: string = "",
        redisDb: number = 0
    ) {
        const command = [
            this.executablePath,
            "-p",
            port.toString(),
            "-m",
            mode,
            "-rh",
            redisHost,
            "-rp",
            redisPort.toString(),
            "-rpwd",
            redisPassword,
            "-rdb",
            redisDb.toString(),
        ];

        // Spawn the subprocess
        this.process = spawn(command[0], command.slice(1), {
            cwd: path.dirname(__filename),
        });

        // Start logging
        this.processLog();
    }

    async stop() {
        if (this.process) {
            try {
                this.process.kill();
                this.process = null;
            } catch (error) {
                logger.warn("Failed to terminate the process:", error);
            }
        }
    }

    private async processLog() {
        if (this.process) {
            const stdout = this.process.stdout;
            const stderr = this.process.stderr;

            stdout.on("data", (data) => {
                logger.info(`[INFO] ${data.toString().trim()}`);
            });

            stderr.on("data", (data) => {
                logger.error(`[ERROR] ${data.toString().trim()}`);
            });

            this.process.on("exit", (code) => {
                logger.info(`WechatAPI exited with code: ${code}`);
            });

            this.process.on("error", (err) => {
                logger.error(`WechatAPI process error: ${err}`);
            });
        }
    }
}
