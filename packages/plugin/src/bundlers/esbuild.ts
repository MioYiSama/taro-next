/** esbuild: one `app.js`, the CSS esbuild bundles next to it (`app.css`) turned into `app.wxss`. */
import * as fs from "node:fs";
import * as path from "node:path";

import {
  APP_ID,
  type Core,
  GLOBALS_ID,
  GLOBALS_MODULE,
  type Hooks,
  NAME,
  idFilter,
  writeOutputs,
} from "../core";

const NAMESPACE = "taro-next";
const FILTER = idFilter(APP_ID, GLOBALS_ID);

export function esbuildAdapter(core: Core): Hooks {
  let outdir = "";
  return {
    transform: undefined,
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
        options.metafile = true;
        options.format = "cjs";
        options.splitting = false;
        options.target ??= "es2018";
        options.define = {
          "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
          ...options.define,
        };
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
          for (const input of Object.keys(result.metafile?.inputs ?? {})) {
            if (input.includes(":")) continue;
            const id = path.resolve(core.root, input);
            core.scan(id, fs.readFileSync(id, "utf8"));
          }
          if (!result.outputFiles) {
            const cssPath = path.join(outdir, "app.css");
            const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
            fs.rmSync(cssPath, { force: true });
            fs.rmSync(`${cssPath}.map`, { force: true });
            return writeOutputs(core, outdir, css);
          }
          // `write: false`
          const cssPath = path.join(outdir, "app.css");
          const index = result.outputFiles.findIndex((file) => file.path === cssPath);
          const css = index < 0 ? "" : result.outputFiles.splice(index, 1)[0]!.text;
          for (const [name, source] of Object.entries(core.outputs(css))) {
            const contents = new TextEncoder().encode(source);
            result.outputFiles.push({
              path: path.join(outdir, name),
              contents,
              hash: "",
              get text() {
                return new TextDecoder().decode(contents);
              },
            });
          }
        });
      },
    },
  };
}
