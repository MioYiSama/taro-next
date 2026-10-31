/** vite, rolldown and rollup: one `app.js` chunk, the CSS assets merged into `app.wxss`. */
import * as path from "node:path";

import type { Plugin as RollupPlugin, RenderedChunk } from "rollup";

import {
  APP_ID,
  APP_JS,
  type Core,
  type Hooks,
  GLOBALS_ID,
  INJECT,
  NAME,
  RESOLVED_APP_ID,
  RUNTIME,
  idFilter,
} from "../core";
import { inject } from "../inject";

interface Bundle {
  [fileName: string]: { type: "asset"; source: string | Uint8Array } | { type: "chunk" };
}

interface Context {
  emitFile(file: { type: "asset"; fileName: string; source: string }): string;
  error(message: string): never;
  resolve(
    id: string,
    importer?: string,
    options?: { skipSelf?: boolean },
  ): Promise<{ id: string } | null>;
}

type Addon = string | ((chunk: RenderedChunk) => string | Promise<string>) | undefined;

const join =
  (...addons: Addon[]) =>
  async (chunk: RenderedChunk) => {
    const parts = await Promise.all(
      addons.map((addon) => (typeof addon === "function" ? addon(chunk) : addon)),
    );
    return parts.filter(Boolean).join("\n");
  };

export function rollupAdapter(core: Core, framework: "vite" | "rolldown" | "rollup"): Hooks {
  const mode = JSON.stringify(process.env.NODE_ENV ?? "production");
  // `this.resolve` follows the bundler's resolution from the project root, so
  // modules that can't see the runtime themselves (pnpm-isolated
  // dependencies) still get the same instance.
  function resolveId(this: Context, id: string) {
    if (id === APP_ID) return RESOLVED_APP_ID;
    if (id === GLOBALS_ID) {
      return this.resolve(RUNTIME, path.join(core.root, "index.js"), { skipSelf: true });
    }
    return null;
  }

  function generateBundle(this: Context, _: unknown, bundle: Bundle) {
    let css = "";
    for (const [fileName, file] of Object.entries(bundle)) {
      if (file.type === "chunk") {
        if (fileName !== APP_JS) this.error(`${NAME}: unexpected chunk ${fileName}`);
      } else if (fileName.endsWith(".css")) {
        css +=
          typeof file.source === "string" ? file.source : new TextDecoder().decode(file.source);
        delete bundle[fileName];
      }
    }
    for (const [fileName, source] of Object.entries(core.outputs(css))) {
      this.emitFile({ type: "asset", fileName, source });
    }
  }

  const output = { format: "cjs", entryFileNames: "[name].js" } as const;
  // The mini program runs each file in a function declaring `window`,
  // `document`, ... as parameters: top-level `let`/`const` of these names
  // (the runtime and user modules have some) would be a syntax error.
  // rolldown rewrites them to `var`, rollup's chunk gets a scope of its own.
  const rolldownOutput = { ...output, codeSplitting: false, topLevelVar: true } as const;

  const hooks = {
    load: { filter: { id: idFilter(RESOLVED_APP_ID) }, handler: () => core.appModule() },
  };

  switch (framework) {
    case "vite":
      return {
        ...hooks,
        vite: {
          apply: "build",
          config(config) {
            return {
              build: {
                target: config.build?.target ?? "es2018",
                cssCodeSplit: false,
                modulePreload: false,
                rolldownOptions: {
                  input: { app: APP_ID },
                  transform: { inject: INJECT },
                  output: rolldownOutput,
                },
              },
            };
          },
          configResolved(config) {
            core.root = config.root;
          },
          resolveId,
          generateBundle,
        },
      };
    case "rolldown":
      return {
        ...hooks,
        rolldown: {
          options(input) {
            core.root = input.cwd ?? process.cwd();
            return {
              ...input,
              input: { app: APP_ID },
              transform: {
                ...input.transform,
                inject: { ...input.transform?.inject, ...INJECT },
                define: { "process.env.NODE_ENV": mode, ...input.transform?.define },
                target: input.transform?.target ?? "es2018",
              },
            };
          },
          outputOptions(options) {
            return { ...options, ...rolldownOutput };
          },
          resolveId,
          generateBundle,
        },
      };
    case "rollup": {
      // Rollup has no `inject` of its own. Added last, so that it sees the
      // JavaScript the other plugins compile (TypeScript, CommonJS, ...).
      const injectPlugin: RollupPlugin = {
        name: `${NAME}:inject`,
        transform: (code, id) => inject(code, id, "js", { "process.env.NODE_ENV": mode }),
      };
      return {
        ...hooks,
        rollup: {
          options(input) {
            return { ...input, input: { app: APP_ID }, plugins: [input.plugins, injectPlugin] };
          },
          outputOptions(options) {
            return {
              ...options,
              ...output,
              inlineDynamicImports: true,
              intro: join("(function () {", options.intro),
              outro: join(options.outro, "})();"),
            };
          },
          resolveId,
          generateBundle,
        },
      };
    }
  }
}
