import * as url from "node:url";

import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      bun: "./src/plugins/bun.ts",
      esbuild: "./src/plugins/esbuild.ts",
      farm: "./src/plugins/farm.ts",
      rolldown: "./src/plugins/rolldown.ts",
      rollup: "./src/plugins/rollup.ts",
      rsbuild: "./src/plugins/rsbuild.ts",
      rspack: "./src/plugins/rspack.ts",
      vite: "./src/plugins/vite.ts",
      webpack: "./src/plugins/webpack.ts",
    },
    exports: true,
    dts: {
      // To support TS 7.1 beta
      generator: "tsgo",
      tsgo: {
        path: url.fileURLToPath(new URL("bin/tsc", import.meta.resolve("typescript/package.json"))),
      },
    },
  },
});
