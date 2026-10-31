/** Farm: one `app.js` resource, the CSS resources merged into `app.wxss`. */
import type { Resource } from "@farmfe/core";

import { APP_ID, APP_JS, type Core, type Hooks, virtualModules } from "../core";
import { inject, langOf } from "../inject";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const text = (resource: Resource) => decoder.decode(new Uint8Array(resource.bytes));

/** Farm writes the resources of resource pots, not those of modules (which `emitFile` creates). */
const resource = (name: string, source: string): Resource => ({
  name,
  bytes: [...encoder.encode(source)],
  emitted: false,
  resourceType: name.slice(name.lastIndexOf(".") + 1),
  origin: { type: "ResourcePot", value: name },
});

/**
 * The mini program runs each file in a function declaring `window`,
 * `document`, ... as parameters: top-level `let`/`const` of these names (the
 * runtime and user modules have some) would be a syntax error. Gives
 * `app.js` a scope of its own. Farm emits no source map for library output.
 */
function wrap(js: Resource): void {
  js.bytes = [...encoder.encode(`(function () {\n${text(js)}\n})();\n`)];
}

export function farmAdapter(core: Core): Hooks {
  return {
    // Added as resources instead.
    buildStart: undefined,
    // Farm prefixes the entries with `./`.
    ...virtualModules(core, `./${APP_ID}`),
    // Farm compiles TypeScript and JSX after the plugins.
    transform: {
      filter: { id: { exclude: [/^\0/, /\.(css|less|sass|scss|styl|stylus|pcss|postcss)(\?|$)/] } },
      handler(code, id) {
        core.scan(id, code);
        const lang = langOf(id);
        return lang ? inject(code, id, lang) : null;
      },
    },
    farm: {
      config(config) {
        const compilation = config.compilation ?? {};
        return {
          ...config,
          compilation: {
            ...compilation,
            input: { app: APP_ID },
            // Farm defines NODE_ENV from its mode for non-node targets.
            script: { ...compilation.script, target: compilation.script?.target ?? "es2018" },
            output: {
              ...compilation.output,
              entryFilename: "[entryName].js",
              filename: "[resourceName].[ext]",
              format: "cjs",
              // Scope hoisted like rollup, browser targets bundle Farm's
              // module system, which needs `window`.
              targetEnv: "library",
            },
            partialBundling: {
              ...compilation.partialBundling,
              // Everything in `app.js`, including `import()`.
              enforceResources: [{ name: "app", test: [".+"] }],
            },
            lazyCompilation: false,
          },
        };
      },
      configResolved(config) {
        core.root = config.root ?? process.cwd();
      },
      finalizeResources: {
        executor({ resourcesMap }) {
          let css = "";
          for (const [name, resource] of Object.entries(resourcesMap)) {
            if (resource.resourceType !== "css") continue;
            css += text(resource);
            delete resourcesMap[name];
            delete resourcesMap[`${name}.map`];
          }
          for (const [name, source] of Object.entries(core.outputs(css))) {
            resourcesMap[name] = resource(name, source);
          }
          for (const [name, source] of Object.entries(core.files())) {
            resourcesMap[name] = resource(name, source);
          }
          if (resourcesMap[APP_JS]) wrap(resourcesMap[APP_JS]);
          return resourcesMap;
        },
      },
    },
  };
}
