import { createUnplugin, type UnpluginFactory } from "unplugin";
import pkg from "../package.json";

import type { AppSchema } from "./schema/app.schema";
import type { ProjectConfigSchema } from "./schema/project.config.schema";
import type { PageComponentSchema } from "./schema/page_component.schema";

export interface Options {
  /**
   * https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.md
   * https://devtools.wxqcloud.qq.com.cn/WechatWebDev/editor-extension/wx-json/project.config.schema.json
   */
  projectConfig?: Partial<ProjectConfigSchema>;

  /**
   * https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app
   * https://devtools.wxqcloud.qq.com.cn/WechatWebDev/editor-extension/wx-json/app.schema.json
   */
  appConfig?: Partial<AppSchema>;

  /**
   * https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/page.md
   * https://devtools.wxqcloud.qq.com.cn/WechatWebDev/plugins/editor/wechat-miniprogram_wx-json/1.0.0/page_component.schema.json
   */
  pageConfig?: Partial<PageComponentSchema>;
}

export const unplugin: UnpluginFactory<Options | null | undefined> = (options) => {
  const { projectConfig = {}, appConfig = {}, pageConfig = {} } = options ?? {};

  return {
    name: pkg.name,
  };
};

export default createUnplugin(unplugin);
