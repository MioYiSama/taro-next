# @taro-next/plugin

把 Web 应用构建成微信小程序的打包插件，基于 [unplugin](https://github.com/unjs/unplugin)。需要和 [`@taro-next/runtime`](../runtime) 一起使用。

```sh
pnpm add @taro-next/runtime
pnpm add -D @taro-next/plugin
```

`@taro-next/runtime` 应作为应用自己的依赖安装：插件从项目根目录解析它，保证应用、框架和注入的全局变量用的是同一个运行时实例。

## 用法

每个打包器有单独的入口，默认导出插件工厂：

| 入口 | 打包器 |
| --- | --- |
| `@taro-next/plugin/vite` | Vite（仅 `vite build`） |
| `@taro-next/plugin/rolldown` | Rolldown |
| `@taro-next/plugin/rollup` | Rollup |
| `@taro-next/plugin/webpack` | webpack 5 |
| `@taro-next/plugin/rspack` | Rspack |
| `@taro-next/plugin/rsbuild` | Rsbuild |
| `@taro-next/plugin/esbuild` | esbuild |
| `@taro-next/plugin/bun` | Bun |
| `@taro-next/plugin/farm` | Farm |

插件会接管入口和输出格式：入口固定为生成的虚拟模块，它先导入 `entry` 选项指定的文件，再注册 `App()`；产物为 CommonJS，代码不分包，未指定时 `target` 为 `es2018`。打包器配置里的 `entry`/`input` 会被覆盖，请用插件的 `entry` 选项指定入口。

### Vite

```ts
import taro from "@taro-next/plugin/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vue({
      template: {
        // 原生组件按原样渲染，不当作 Vue 组件解析
        compilerOptions: { isCustomElement: (tag) => tag === "scroll-view" },
      },
    }),
    taro(),
  ],
});
```

插件只在 `build` 阶段生效，开发时用 `vite build --watch --mode development`。

### Rolldown / Rollup

```ts
import taro from "@taro-next/plugin/rollup";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import css from "rollup-plugin-import-css";

export default {
  plugins: [nodeResolve(), commonjs(), css(), taro()],
  output: { dir: "dist" },
};
```

Rollup 需要自备模块解析、CommonJS 和 CSS 插件。Rolldown 自带前两者，CSS 同样需要插件把它作为资源输出（例如 `rollup-plugin-import-css` 配合 `moduleTypes: { ".css": "js" }`）。两者都以 `cwd` 作为项目根目录。

### webpack / Rspack

```js
import path from "node:path";
import taro from "@taro-next/plugin/webpack"; // Rspack 用 @taro-next/plugin/rspack

export default {
  output: { path: path.resolve("dist") },
  experiments: { css: true }, // Rspack 不需要
  module: { rules: [{ test: /\.css$/, type: "css/auto" }] },
  plugins: [taro()],
};
```

CSS 由你自己的配置产出 `.css` 资源（原生 CSS 或 `mini-css-extract-plugin` 都可以），插件把它们合并成 `app.wxss`。插件会关闭 `splitChunks` 和 `runtimeChunk`，并把块数限制为 1；webpack 未设置 `devtool` 时设为 `false`，因为小程序里没有 `eval`。项目根目录取 `context`。

### Rsbuild

```ts
import taro from "@taro-next/plugin/rsbuild";
import { defineConfig } from "@rsbuild/core";

export default defineConfig({ plugins: [taro()] });
```

只在 `build` 阶段生效。插件替换入口（不生成 HTML）、关闭 `splitChunks`，JS 和 CSS 直接输出到 `distPath.root`。

### esbuild

```ts
import taro from "@taro-next/plugin/esbuild";
import { build } from "esbuild";

await build({ outdir: "dist", plugins: [taro()] });
```

必须用 `outdir`，不能用 `outfile`，因为产物有多个文件。`bundle`、`format`、`entryPoints` 由插件设置。支持 `write: false`，生成的文件会追加到 `outputFiles`。

### Bun

```ts
import taro from "@taro-next/plugin/bun";

await Bun.build({ entrypoints: [], outdir: "dist", plugins: [taro()] });
```

`entrypoints` 会被插件替换。Bun 没有 `inject`，插件在加载阶段用 `oxc-transform` 注入全局变量。Bun 只把 JS/TS 源码交给插件，其他格式里用到的原生组件需要写进 `components` 选项。

### Farm

```ts
import taro from "@taro-next/plugin/farm";
import { defineConfig } from "@farmfe/core";

export default defineConfig({ plugins: [taro()] });
```

## 选项

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `entry` | `string` | `"src/index"` | 应用入口，相对项目根目录解析。普通 Web 代码，在模块顶层渲染到 `document.body` |
| `baseLevel` | `number` | `16` | `base.wxml` 直接展开的模板嵌套层数。更深的树仍能渲染，每多 `baseLevel` 层多用一层 `comp` 自定义组件 |
| `pxtransform` | `false \| { designWidth?: number }` | `{ designWidth: 750 }` | CSS 和内联样式里的 `px` 换算为 `rpx`：`rpx = px * 750 / designWidth`。写成大写 `PX` 可保留像素值。设为 `false` 时不换算 |
| `components` | `string[]` | `[]` | 无论源码是否出现都生成模板的原生组件，见下文 |
| `projectConfig` | `Partial<ProjectConfigSchema>` | | 写入 `project.config.json`。`compileType` 默认为 `"miniprogram"`，`appid` 默认为 `"touristappid"` |
| `appConfig` | `Omit<Partial<AppSchema>, "pages">` | | 写入 `app.json`。`pages` 由插件管理，固定为单页面 |
| `pageConfig` | `Partial<PageComponentSchema>` | | 写入 `pages/index/index.json`。`usingComponents` 会与插件自己的 `comp` 合并 |

三个配置选项的类型由微信开发者工具的 JSON Schema 生成，位于 `src/schema/`，可用 `pnpm schema` 重新生成。

## 输出

```
dist/
├── app.js               应用和运行时，单个 CommonJS 文件
├── app.json
├── app.wxss             内置 HTML 默认样式 + 转换后的应用 CSS
├── base.wxml            渲染序列化 DOM 的递归模板
├── utils.wxs
├── project.config.json
├── pages/index/         唯一的页面
└── comp/                超过 baseLevel 后继续渲染的递归组件
```

用微信开发者工具打开输出目录即可预览。

### CSS 转换

打包器产出的所有 CSS 合并后按以下规则转换：

| Web | 小程序 |
| --- | --- |
| `html`、`:root` | `page` |
| `*` | `view` |
| `div`、`p`、`span`、`h1` 等 HTML 标签 | `.h5-div`、`.h5-p` …… |
| `img` | `image` |
| `16px` | `32rpx`（`designWidth: 375` 时） |
| `16PX` | 不变 |

`@keyframes` 内的选择器和 `url(...)` 里的内容不做转换，`# sourceMappingURL` 注释会被删除。

### 原生组件与模板裁剪

`base.wxml` 只包含用到的原生组件模板，用于控制包体积。插件扫描参与打包的源码模块（CSS 和运行时自身除外）：

- 标签写法计入，如 `<video`；
- 只包含标签名的字符串字面量计入，如 `createElement("video")`、`jsx("video", …)`；
- 字面量列表中的项（`["canvas", "video"]`）和 `case "video":` 不计入，避免把框架内部的标签表全部算进去；
- `img` 计为 `image`；`checkbox` 计为 `checkbox` 和 `switch`、`range` 计为 `slider`，因为 `<input type="checkbox">` 和 `<input type="range">` 分别渲染为 `switch` 和 `slider`。`view` 总是包含。

标签名在运行时动态拼接，或者只出现在列表里时，必须写进 `components`，否则对应节点不会渲染。`components` 里写了未知的组件名，创建插件时就会报错。

## 环境变量

Rolldown、Rollup、esbuild 和 Bun 会按构建进程的 `NODE_ENV` 定义 `process.env.NODE_ENV`，未设置时为 `"production"`；Rolldown、esbuild 和 Bun 里用户自己的 `define` 优先。Vite、webpack、Rspack、Rsbuild 和 Farm 使用各自按 mode 设定的值。

## 测试

```sh
pnpm test
```

`test/bundlers.test.ts` 用每个支持的打包器构建 `test/fixture`，再像小程序那样执行产物：每个文件包在一个函数里，`window`、`document` 等浏览器全局变量作为参数传入并被遮蔽为 `undefined`。本机装有 `bun` 时才运行 Bun 用例。
