import { defineConfig } from "vite-plus";
import * as url from "node:url";

export default defineConfig({
  pack: {
    entry: {
      index: "./src/index.ts",
      internal: "./src/internal.ts",
      components: "./src/components.ts",
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
