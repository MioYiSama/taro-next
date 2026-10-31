import * as path from "node:path";

import { createUnplugin, type UnpluginFactory } from "unplugin";

import pkg from "../package.json";
import type { AppSchema } from "./schema/app.schema";
import type { PageComponentSchema } from "./schema/page_component.schema";
import type { ProjectConfigSchema } from "./schema/project.config.schema";
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

export interface Options {
  /**
   * App entry, resolved from the project root. It calls `start()` from
   * `@taro-next/runtime`.
   * @default "src/index"
   */
  entry?: string;

  /**
   * Template nesting depth rendered by `base.wxml` before handing over to the
   * recursive `comp` component. Deeper trees still render, each extra
   * `baseLevel` levels cost one custom component.
   * @default 16
   */
  baseLevel?: number;

  /**
   * https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.md
   * https://devtools.wxqcloud.qq.com.cn/WechatWebDev/editor-extension/wx-json/project.config.schema.json
   */
  projectConfig?: Partial<ProjectConfigSchema>;

  /**
   * `pages` is managed by the plugin: the app has a single page.
   * https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app
   * https://devtools.wxqcloud.qq.com.cn/WechatWebDev/editor-extension/wx-json/app.schema.json
   */
  appConfig?: Omit<Partial<AppSchema>, "pages">;

  /**
   * https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/page.md
   * https://devtools.wxqcloud.qq.com.cn/WechatWebDev/plugins/editor/wechat-miniprogram_wx-json/1.0.0/page_component.schema.json
   */
  pageConfig?: Partial<PageComponentSchema>;
}

const APP_ID = "taro-next:app";
const RESOLVED_APP_ID = `\0${APP_ID}`;
/** Import source of injected globals, resolved to `@taro-next/runtime` from the project root. */
const GLOBALS_ID = "taro-next:globals";

/**
 * Free references the mini program leaves undefined (or doesn't provide),
 * replaced by imports of the runtime's implementation.
 */
const GLOBALS = [
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
  "Event",
  "CustomEvent",
  "ErrorEvent",
  "PopStateEvent",
  "HashChangeEvent",
  "EventTarget",
  "Node",
  "Element",
  "HTMLElement",
  "SVGElement",
  "Text",
  "Comment",
  "DocumentFragment",
  "Document",
  "CSSStyleDeclaration",
];

const INJECT: Record<string, [string, string]> = Object.fromEntries(
  GLOBALS.map((name) => [name, [GLOBALS_ID, name]]),
);

const SUPPORTED = ["vite", "rolldown"];

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

interface Bundle {
  [fileName: string]: { type: "asset"; source: string | Uint8Array } | { type: "chunk" };
}

export const unplugin: UnpluginFactory<Options | null | undefined> = (options, meta) => {
  if (!SUPPORTED.includes(meta.framework)) {
    throw new Error(
      `${pkg.name}: ${meta.framework} is not supported, use one of: ${SUPPORTED.join(", ")}`,
    );
  }
  const {
    entry = "src/index",
    baseLevel = 16,
    projectConfig = {},
    appConfig = {},
    pageConfig = {},
  } = options ?? {};
  if (!Number.isInteger(baseLevel) || baseLevel < 1) {
    throw new Error(`${pkg.name}: baseLevel must be a positive integer`);
  }
  let root = process.cwd();

  function generateBundle(
    this: {
      emitFile(file: { type: "asset"; fileName: string; source: string }): string;
      error(message: string): never;
    },
    _: unknown,
    bundle: Bundle,
  ) {
    let css = "";
    for (const [fileName, file] of Object.entries(bundle)) {
      if (file.type === "chunk") {
        if (fileName !== "app.js") this.error(`${pkg.name}: unexpected chunk ${fileName}`);
      } else if (fileName.endsWith(".css")) {
        css +=
          typeof file.source === "string" ? file.source : new TextDecoder().decode(file.source);
        delete bundle[fileName];
      }
    }
    this.emitFile({ type: "asset", fileName: "app.wxss", source: BASE_WXSS + css });
  }

  // Native hook (vite/rolldown context): `this.resolve` follows the bundler's
  // resolution from the project root, so modules that can't see the runtime
  // themselves (pnpm-isolated dependencies) still get the same instance.
  function resolveId(
    this: {
      resolve(
        id: string,
        importer?: string,
        options?: { skipSelf?: boolean },
      ): Promise<{ id: string } | null>;
    },
    id: string,
  ) {
    if (id === APP_ID) return RESOLVED_APP_ID;
    if (id === GLOBALS_ID) {
      return this.resolve("@taro-next/runtime", path.join(root, "index.js"), { skipSelf: true });
    }
    return null;
  }

  return {
    name: pkg.name,
    enforce: "post",

    buildStart() {
      const files: Record<string, string> = {
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
      };
      for (const [fileName, source] of Object.entries(files)) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },

    loadInclude: (id) => id === RESOLVED_APP_ID,
    load() {
      const entryPath = path.resolve(root, entry);
      return [
        'import { createAppConfig } from "@taro-next/runtime/internal";',
        `import ${JSON.stringify(entryPath)};`,
        "App(createAppConfig());",
        "",
      ].join("\n");
    },

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
              output: { format: "cjs", entryFileNames: "[name].js", codeSplitting: false },
            },
          },
        };
      },
      configResolved(config) {
        root = config.root;
      },
      resolveId,
      generateBundle,
    },

    rolldown: {
      options(input) {
        return {
          ...input,
          input: { app: APP_ID },
          transform: { ...input.transform, inject: { ...input.transform?.inject, ...INJECT } },
        };
      },
      outputOptions(output) {
        return { ...output, format: "cjs", entryFileNames: "[name].js", codeSplitting: false };
      },
      resolveId,
      generateBundle,
    },
  };
};

export default createUnplugin(unplugin);
