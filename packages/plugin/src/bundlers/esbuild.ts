/** esbuild: one `app.js`, the CSS esbuild bundles next to it (`app.css`) turned into `app.wxss`. */
import * as path from "node:path";

import {
  APP_ID,
  APP_WXSS,
  type Core,
  GLOBALS_ID,
  GLOBALS_MODULE,
  type Hooks,
  NAME,
  idFilter,
  writeWxss,
} from "../core";

const NAMESPACE = "taro-next";
const FILTER = idFilter(APP_ID, GLOBALS_ID);

export function esbuildAdapter(core: Core): Hooks {
  let outdir = "";
  return {
    esbuild: {
      config(options) {
        if (options.outfile)
          throw new Error(`${NAME}: use outdir, the build outputs several files`);
        core.root = options.absWorkingDir ?? process.cwd();
        // Absolute: unplugin writes emitted files relative to the working directory.
        outdir = options.outdir = path.resolve(core.root, options.outdir ?? "dist");
        options.entryPoints = { app: APP_ID };
        options.entryNames = "[name]";
        options.bundle = true;
        options.format = "cjs";
        options.splitting = false;
        options.target ??= "es2018";
        // Inject files are resolved like imports, including by the plugins.
        options.inject = [...(options.inject ?? []), GLOBALS_ID];
      },
      setup(build) {
        build.onResolve({ filter: FILTER }, (args) => ({ path: args.path, namespace: NAMESPACE }));
        build.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => ({
          contents: args.path === APP_ID ? core.appModule() : GLOBALS_MODULE,
          resolveDir: core.root,
          loader: "js",
        }));
        build.onEnd((result) => {
          if (result.errors.length) return;
          if (!result.outputFiles) return writeWxss(core, outdir);
          // `write: false`
          const cssPath = path.join(outdir, "app.css");
          const index = result.outputFiles.findIndex((file) => file.path === cssPath);
          const css = index < 0 ? "" : result.outputFiles.splice(index, 1)[0]!.text;
          const contents = new TextEncoder().encode(core.wxss(css));
          result.outputFiles.push({
            path: path.join(outdir, APP_WXSS),
            contents,
            hash: "",
            get text() {
              return new TextDecoder().decode(contents);
            },
          });
        });
      },
    },
  };
}
