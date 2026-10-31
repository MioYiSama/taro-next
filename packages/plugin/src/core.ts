import * as fs from "node:fs";
import * as path from "node:path";

import type { UnpluginOptions } from "unplugin";

import pkg from "../package.json";
import type { Options } from "./index";
import {
  BASE_WXSS,
  COMP_JS,
  COMP_JSON,
  COMP_WXML,
  PAGE,
  PAGE_JS,
  PAGE_WXML,
  baseWxml,
  utilsWxs,
} from "./templates";

export const NAME = pkg.name;

// Virtual module ids. `~` rather than a `scheme:` prefix, which webpack
// reads as a URI.

/** App entry: imports the user entry and registers `App()`. */
export const APP_ID = "~taro-next/app";
export const RESOLVED_APP_ID = `\0${APP_ID}`;

/** Import source of injected globals, resolved to `@taro-next/runtime` from the project root. */
export const GLOBALS_ID = "~taro-next/globals";
export const RESOLVED_GLOBALS_ID = `\0${GLOBALS_ID}`;

export const RUNTIME = "@taro-next/runtime";

/** Hook filter matching exactly the given ids. */
export const idFilter = (...ids: string[]) =>
  new RegExp(`^(?:${ids.map((id) => id.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&")).join("|")})$`);

/** Output names, relative to the output directory. */
export const APP_JS = "app.js";
export const APP_WXSS = "app.wxss";

/**
 * Free references the mini program leaves undefined (or doesn't provide),
 * replaced by imports of the runtime's implementation.
 */
export const GLOBALS = [
  "window",
  "self",
  "document",
  "navigator",
  "location",
  "history",
  "localStorage",
  "sessionStorage",
  "screen",
  "performance",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "queueMicrotask",
  "getComputedStyle",
  "matchMedia",
  "customElements",
  "Event",
  "CustomEvent",
  "ErrorEvent",
  "PopStateEvent",
  "HashChangeEvent",
  "EventTarget",
  "Node",
  "Element",
  "HTMLElement",
  "HTMLIFrameElement",
  "HTMLMediaElement",
  "SVGElement",
  "Text",
  "Comment",
  "DocumentFragment",
  "Document",
  "CSSStyleDeclaration",
];

/** `inject` map (`@rollup/plugin-inject` format) of the globals to `GLOBALS_ID`. */
export const INJECT: Record<string, [string, string]> = Object.fromEntries(
  GLOBALS.map((name) => [name, [GLOBALS_ID, name]]),
);

/**
 * Source of `GLOBALS_ID` for bundlers resolving it as a module of its own:
 * its import is resolved from the project root, like the app entry's.
 */
export const GLOBALS_MODULE = `export { ${GLOBALS.join(", ")} } from "${RUNTIME}";\n`;

/** What an adapter adds to the plugin for its bundler. */
export type Hooks = Omit<UnpluginOptions, "name">;

/** Bundler-independent part of the plugin, shared by the adapters. */
export interface Core {
  /** Project root: the user entry and the runtime are resolved from it. Set by the adapters. */
  root: string;
  /** Static mini program files, by output file name. */
  files(): Record<string, string>;
  /** Source of `APP_ID`. */
  appModule(): string;
  /** `app.wxss` from the bundled CSS. */
  wxss(css: string): string;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export function createCore(options: Options | null | undefined): Core {
  const {
    entry = "src/index",
    baseLevel = 16,
    projectConfig = {},
    appConfig = {},
    pageConfig = {},
  } = options ?? {};
  if (!Number.isInteger(baseLevel) || baseLevel < 1) {
    throw new Error(`${NAME}: baseLevel must be a positive integer`);
  }
  return {
    root: process.cwd(),
    files: () => ({
      "project.config.json": json({ compileType: "miniprogram", ...projectConfig }),
      "app.json": json({ pages: [PAGE], ...appConfig }),
      [`${PAGE}.js`]: PAGE_JS,
      [`${PAGE}.json`]: json({
        ...pageConfig,
        usingComponents: { ...pageConfig.usingComponents, comp: "../../comp/comp" },
      }),
      [`${PAGE}.wxml`]: PAGE_WXML,
      "base.wxml": baseWxml(baseLevel),
      "utils.wxs": utilsWxs(),
      "comp/comp.js": COMP_JS,
      "comp/comp.json": COMP_JSON,
      "comp/comp.wxml": COMP_WXML,
    }),
    appModule() {
      return [
        `import { createAppConfig } from "${RUNTIME}/internal";`,
        `import ${JSON.stringify(path.resolve(this.root, entry))};`,
        "App(createAppConfig());",
        "",
      ].join("\n");
    },
    wxss: (css) => BASE_WXSS + css,
  };
}

/**
 * `APP_ID` and `GLOBALS_ID` as virtual modules: bundlers place those in the
 * project root, so their imports are resolved from there.
 */
export const virtualModules = (core: Core, appId = APP_ID): Hooks => ({
  resolveId(id) {
    if (id === appId) return RESOLVED_APP_ID;
    if (id === GLOBALS_ID) return RESOLVED_GLOBALS_ID;
    return null;
  },
  load: {
    filter: { id: idFilter(RESOLVED_APP_ID, RESOLVED_GLOBALS_ID) },
    handler: (id) => (id === RESOLVED_APP_ID ? core.appModule() : GLOBALS_MODULE),
  },
});

/** Turns the `app.css` written next to `app.js` (esbuild, Bun) into `app.wxss`. */
export function writeWxss(core: Core, outdir: string): void {
  const cssPath = path.join(outdir, "app.css");
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
  fs.rmSync(cssPath, { force: true });
  fs.rmSync(`${cssPath}.map`, { force: true });
  fs.writeFileSync(path.join(outdir, APP_WXSS), core.wxss(css));
}
