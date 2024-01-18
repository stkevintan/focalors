const path = require("path");
module.exports = {
    apps: [
        {
            name: "Focalors",
            script: "./bin/focalors.ts",
            max_memory_restart: "512M",
            restart_delay: 10000,
            kill_timeout: 10000,
            wait_ready: true,
            shutdown_with_message: true,
            interpreter: "node",
            interpreterArgs: "--import tsx",
            env: {
                TSX_TSCONFIG_PATH: "./tsconfig.json",
                NODE_PATH: `${createPath(
                    ".pnpm/tsx@4.7.0/node_modules/tsx/dist/node_modules"
                )}; ${createPath(
                    ".pnpm/tsx@4.7.0/node_modules/tsx/node_modules"
                )};${createPath(`.pnpm/tsx@4.7.0/node_modules`)};${createPath(
                    `.pnpm/node_modules`
                )};${process.env.NODE_PATH}`,
            },
            cwd: __dirname,
        },
    ],
};

function createPath(subp) {
    return path.resolve(__dirname, "node_modules", subp);
}
