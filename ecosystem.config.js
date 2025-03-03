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
            },
            cwd: __dirname,
        },
    ],
};

