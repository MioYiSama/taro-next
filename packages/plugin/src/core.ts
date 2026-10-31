import * as fs from "node:fs";
import * as path from "node:path";

import type { UnpluginOptions } from "unplugin";

import pkg from "../package.json";
import { COMPONENTS } from "./components";
import { toWxss } from "./css";
import type { Options } from "./index";
import { type Scanner, createScanner } from "./scan";
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
  "FocusEvent",
  "KeyboardEvent",
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
  "MutationObserver",
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
  /** Resolved inline-style and stylesheet design width, or 0 to leave px unchanged. */
  designWidth: number;
  /** Static mini program files, by output file name. */
  files(): Record<string, string>;
  /** Source of `APP_ID`. */
  appModule(): string;
  /** `app.wxss` from the bundled CSS. */
  wxss(css: string): string;
  /** Record the native component names present in a source module. */
  scan(id: string, code: string): void;
  /** CSS and templates generated from the complete set of scanned modules. */
  outputs(css: string): Record<string, string>;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export function createCore(options: Options | null | undefined): Core {
  const {
    entry = "src/index",
    baseLevel = 16,
    pxtransform = {},
    components = [],
    projectConfig = {},
    appConfig = {},
    pageConfig = {},
  } = options ?? {};
  if (!Number.isInteger(baseLevel) || baseLevel < 1) {
    throw new Error(`${NAME}: baseLevel must be a positive integer`);
  }
  const designWidth = pxtransform === false ? 0 : (pxtransform.designWidth ?? 750);
  if (pxtransform !== false && (!Number.isFinite(designWidth) || designWidth <= 0)) {
    throw new Error(`${NAME}: pxtransform.designWidth must be a positive number`);
  }
  for (const name of components) {
    if (!Object.hasOwn(COMPONENTS, name)) throw new Error(`${NAME}: unknown component "${name}"`);
  }
  let scanner: Scanner | undefined;
  const wxml = new Map<string, string>();
  return {
    root: process.cwd(),
    designWidth,
    files: () => ({
      "project.config.json": json({
        compileType: "miniprogram",
        ...projectConfig,
        appid: projectConfig.appid ?? "touristappid",
      }),
      "app.json": json({ pages: [PAGE], ...appConfig }),
      [`${PAGE}.js`]: PAGE_JS,
      [`${PAGE}.json`]: json({
        ...pageConfig,
        usingComponents: { ...pageConfig.usingComponents, comp: "../../comp/comp" },
      }),
      [`${PAGE}.wxml`]: PAGE_WXML,
      "comp/comp.js": COMP_JS,
      "comp/comp.json": COMP_JSON,
      "comp/comp.wxml": COMP_WXML,
    }),
    appModule() {
      return [
        `import { createAppConfig } from "${RUNTIME}/internal";`,
        `import ${JSON.stringify(path.resolve(this.root, entry))};`,
        `App(createAppConfig({ baseLevel: ${baseLevel}, designWidth: ${designWidth} }));`,
        "",
      ].join("\n");
    },
    wxss: (css) => BASE_WXSS + toWxss(css, designWidth),
    scan(id, code) {
      (scanner ??= createScanner(this.root)).scan(id, code);
    },
    outputs(css) {
      const used = (scanner ??= createScanner(this.root)).used(components);
      const key = `${baseLevel}:${[...used].sort().join(",")}`;
      let template = wxml.get(key);
      if (template === undefined) {
        template = baseWxml(baseLevel, used);
        wxml.set(key, template);
      }
      return {
        [APP_WXSS]: this.wxss(css),
        "base.wxml": template,
        "utils.wxs": utilsWxs(used),
      };
    },
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

/** Write the stylesheet and pruned templates after all sources have been scanned. */
export function writeOutputs(core: Core, outdir: string, css: string): void {
  for (const [name, source] of Object.entries(core.outputs(css))) {
    fs.writeFileSync(path.join(outdir, name), source);
  }
}
