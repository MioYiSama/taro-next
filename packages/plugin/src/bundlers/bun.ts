/** Bun: one `app.js`, the CSS Bun bundles next to it (`app.css`) turned into `app.wxss`. */
import * as fs from "node:fs";
import * as path from "node:path";

import {
  APP_ID,
  type Core,
  GLOBALS_ID,
  GLOBALS_MODULE,
  type Hooks,
  idFilter,
  writeWxss,
} from "../core";
import { SCRIPT, inject, langOf } from "../inject";

const NAMESPACE = "taro-next";
const FILTER = idFilter(APP_ID, GLOBALS_ID);

export function bunAdapter(core: Core): Hooks {
  return {
    bun: {
      setup(build) {
        const { config } = build;
        // Set, Bun would derive it from the entry, a virtual module.
        core.root = config.root ??= process.cwd();
        const outdir = (config.outdir = path.resolve(core.root, config.outdir ?? "dist"));
        config.entrypoints = [APP_ID];
        config.naming = "[name].[ext]";
        config.format = "cjs";
        config.splitting = false;

        build.onResolve({ filter: FILTER }, (args) => ({ path: args.path, namespace: NAMESPACE }));
        build.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => ({
          contents: args.path === APP_ID ? core.appModule() : GLOBALS_MODULE,
          loader: "js",
        }));
        // Bun has no `inject`, and its plugins see the sources.
        build.onLoad({ filter: SCRIPT }, async (args) => {
          const lang = langOf(args.path)!;
          const result = await inject(
            await fs.promises.readFile(args.path, "utf8"),
            args.path,
            lang,
          );
          return result ? { contents: result.code, loader: lang } : undefined;
        });
        build.onEnd((result) => {
          if (result.success) writeWxss(core, outdir);
        });
      },
    },
  };
}
