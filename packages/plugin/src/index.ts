import type { UnpluginFactory } from "unplugin";

import { bunAdapter } from "./bundlers/bun";
import { esbuildAdapter } from "./bundlers/esbuild";
import { farmAdapter } from "./bundlers/farm";
import { rollupAdapter } from "./bundlers/rollup";
import { rsbuildAdapter, webpackAdapter } from "./bundlers/webpack";
import { type Core, type Hooks, NAME, createCore } from "./core";
import type { AppSchema } from "./schema/app.schema";
import type { PageComponentSchema } from "./schema/page_component.schema";
import type { ProjectConfigSchema } from "./schema/project.config.schema";

export interface Options {
  /**
   * App entry, resolved from the project root: plain web code rendering into
   * `document.body` at its top level.
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
   * px in CSS and inline styles become rpx: `rpx = px * 750 / designWidth`;
   * write `PX` to keep a pixel value. Set false to keep all px unchanged.
   * @default { designWidth: 750 }
   */
  pxtransform?: false | { designWidth?: number };

  /**
   * Native components to always generate templates for, in addition to the
   * ones found in the sources (markup like `<video`, or a string literal
   * like `createElement("video")`; items of literal lists and `case` labels
   * don't count). Dynamically constructed names, or names only taken from a
   * list, must be listed: a node whose native component was pruned renders
   * nothing.
   */
  components?: string[];

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

const ADAPTERS: Record<string, (core: Core) => Hooks> = {
  vite: (core) => rollupAdapter(core, "vite"),
  rolldown: (core) => rollupAdapter(core, "rolldown"),
  rollup: (core) => rollupAdapter(core, "rollup"),
  webpack: (core) => webpackAdapter(core, "webpack"),
  rspack: (core) => webpackAdapter(core, "rspack"),
  rsbuild: rsbuildAdapter,
  esbuild: esbuildAdapter,
  bun: bunAdapter,
  farm: farmAdapter,
};

export const unplugin: UnpluginFactory<Options | null | undefined> = (options, meta) => {
  const adapter = ADAPTERS[meta.framework];
  if (!adapter) {
    throw new Error(
      `${NAME}: ${meta.framework} is not supported, use one of: ${Object.keys(ADAPTERS).join(", ")}`,
    );
  }
  const core = createCore(options);
  return {
    name: NAME,
    enforce: "post",
    buildStart() {
      for (const [fileName, source] of Object.entries(core.files())) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },
    transform: {
      filter: { id: { exclude: [/^\0/, /\.(css|less|sass|scss|styl|stylus|pcss|postcss)(\?|$)/] } },
      handler(code, id) {
        core.scan(id, code);
        return null;
      },
    },
    ...adapter(core),
  };
};
