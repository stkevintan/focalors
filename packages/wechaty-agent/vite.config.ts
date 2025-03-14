import { defineConfig } from "vite";

import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/packages/wechaty-agent",

    plugins: [nxViteTsPaths()],

    // Uncomment this if you are using workers.
    // worker: {
    //  plugins: [ nxViteTsPaths() ],
    // },

    test: {
        globals: true,
        cache: { dir: "../../node_modules/.vitest" },
        environment: "node",
        testTimeout: 600_000,
        include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
        reporters: ["default"],
        coverage: {
            reportsDirectory: "../../coverage/packages/wechaty-agent",
            provider: "v8",
        },
    },
});
