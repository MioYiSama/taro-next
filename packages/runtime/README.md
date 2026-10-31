# @taro-next/runtime

运行在微信小程序逻辑层的 DOM/BOM 实现。框架和应用代码照常操作 `document`；运行时把 DOM 树序列化后通过 `setData` 交给视图层，再把视图层的原生事件转成 DOM 事件派发回来。

它需要配合 [`@taro-next/plugin`](../plugin) 使用：插件把代码里的 `window`、`document` 等全局引用替换成从本包导入，生成注册 `App()` 的入口和渲染用的 WXML 模板。

```sh
pnpm add @taro-next/runtime
```

## 入口

| 入口 | 用途 |
| --- | --- |
| `@taro-next/runtime` | 公开 API：`configure`、`nextTick` 和全部 DOM/BOM 全局对象 |
| `@taro-next/runtime/components` | 原生组件的属性表和 HTML 标签映射，插件生成模板和转换 CSS 时使用 |
| `@taro-next/runtime/internal` | 插件生成的入口使用，不属于公开 API |

## API

### `configure(options)`

为 `App()` 和唯一的页面 `Page()` 追加配置。只能在应用入口执行期间调用，即 `App()` 注册之前，否则会抛错。

```ts
import { configure } from "@taro-next/runtime";

configure({
  app: {
    onLaunch(options) {},
  },
  page: {
    onShareAppMessage: () => ({ title: "Demo" }),
    onPageScroll() {}, // 定义后 window.scrollY 会同步更新，并在 window 上派发 scroll
  },
});
```

- `app`：额外的 `App()` 选项。`onShow`、`onHide` 在运行时自己的处理之后调用。
- `page`：额外的 `Page()` 选项，如 `onShareAppMessage`、`onPullDownRefresh`、`onReachBottom`。`onLoad`、`onUnload`、`onResize` 同样在运行时处理之后调用。

多次调用时按浅合并累积。

### `nextTick(callback)`

在当前积压的 DOM 变更被视图层应用后调用 `callback`（对应 `setData` 的回调）。没有积压变更时也会安排一次刷新。

## 渲染

- `document.body` 是页面的根节点。DOM 变更在微任务中合并，每个 tick 对页面和每个 `comp` 组件实例最多调用一次 `setData`，只发送变化的数据路径。
- 元素按标签名对应原生组件：
  - 原生组件名直接使用：`view`、`text`、`button`、`input`、`textarea`、`image`、`scroll-view`、`swiper`、`swiper-item`、`picker`、`video`、`canvas`、`web-view` 等；
  - `img` → `image`，`<input type="checkbox">` → `switch`，`<input type="range">` → `slider`；
  - 其余 HTML 标签渲染为带 `h5-<tag>` 类名的 `view`，插件提供的 `app.wxss` 为它们补上浏览器默认样式（标题字号、列表缩进等）。
- 属性名不区分大小写和连字符：`scroll-y`、`scrollY`、`scrolly` 指向同一个 WXML 属性。字符串值会按组件需要转换类型：布尔属性的 `""`、`"true"` 转为 `true`，数字字符串转为数字。
- 内联样式中的 `px` 按插件的 `pxtransform` 配置换算为 `rpx`，规则与 CSS 相同。
- 没有监听任何触摸事件的 `view` 使用不绑定事件的模板；只监听 `click` 的只绑定 `tap`；设置了 `catchMove` 属性的加上 `catchtouchmove`，阻止页面滚动。

## 事件

原生事件被包装成 `MiniProgramEvent`（继承 `CustomEvent`）在 DOM 上派发，带有原生的 `detail`、`touches`、`changedTouches`，以及 `clientX`/`clientY`/`pageX`/`pageY`；原始事件在 `event.mpEvent` 上。

| 原生事件 | DOM 事件 |
| --- | --- |
| `tap` | `click` |
| `touchstart` / `touchmove` / `touchend` / `touchcancel` / `longpress` | 同名 |
| `focus` / `blur` | `focus` + `focusin` / `blur` + `focusout`，同时更新 `document.activeElement` |
| `input` 的 `confirm` | `keydown`（`Enter`）、`confirm`、`keyup` |
| `switch`（checkbox）的 `change` | `click`、`input`、`change` |
| `slider`（range）的 `changing` / `change` | `input` / `input` + `change` |
| 其他组件事件 | 同名 |

`click`、触摸事件、`input`、`change`、`submit`、`reset` 冒泡，其余不冒泡。派发前，`value`、`checked`、`current` 等属性会先按原生事件同步，框架（例如 React 的受控组件）读到的就是用户输入后的值。

## BOM

| 对象 | 行为 |
| --- | --- |
| `location` / `history` | 内存实现，供前端路由使用。导航不会重新加载；赋值 `location`（或 `href`、`pathname`、`search`、`hash`）会新增历史记录并派发 `popstate`，hash 变化时还会派发 `hashchange`。启动参数和页面 query 写入 `location.search` |
| `localStorage` | `wx.*StorageSync` |
| `sessionStorage` | 内存 |
| `navigator` | `language`、`platform`、`userAgent` 来自系统信息 |
| `screen`、`innerWidth`、`innerHeight`、`devicePixelRatio` | 来自 `wx.getWindowInfo` |
| `matchMedia` | 支持 `min/max-width`、`min/max-height`、`orientation`、`prefers-color-scheme`（跟随系统主题）、`prefers-reduced-motion`、`hover`、`pointer`；尺寸或主题变化时更新 |
| `scrollTo` / `scroll` | `wx.pageScrollTo` |
| `alert` | `wx.showModal` |
| `document.title` | 设置时调用 `wx.setNavigationBarTitle` |
| `document.visibilityState` | 随 `App` 的 `onShow`/`onHide` 变化，并派发 `visibilitychange` |
| `requestAnimationFrame` | 16ms 定时器，同一帧的回调共用一个时间戳 |
| `resize` | 页面 `onResize` 时在 `window` 上派发 |

## DOM

支持框架用到的常见 DOM 接口：

- `Node` 树操作（`appendChild`、`insertBefore`、`append`、`replaceWith`、`cloneNode` 等），`textContent`；
- `Element` 属性和 `dataset`、`classList`、`style`（含 `cssText` 和驼峰属性访问）、`innerHTML` / `outerHTML`、`insertAdjacentHTML`；
- `querySelector(All)`、`matches`、`closest`、`getElementById`、`getElementsByTagName`、`getElementsByClassName`；
- `EventTarget` 的捕获、冒泡、`once`，以及 `on*` 事件属性；
- `MutationObserver`；
- `HTMLElement`、`SVGElement`、`HTMLMediaElement` 的 `instanceof` 按命名空间和标签判断，因为所有元素实际上都是同一个 `Element` 类。

## 限制

- 不支持自定义元素，`customElements` 为 `undefined`。Svelte 等框架会把带 `-` 的原生组件名当成可能的自定义元素，这样检测时不会抛 `ReferenceError`。
- `getComputedStyle` 只返回内联样式，计算后的值由视图层决定，逻辑层无法读取。
- `innerHTML` 解析器只处理框架生成的规范标记（元素、属性、空元素、原始文本元素、注释、字符引用），不实现 HTML5 的容错规则。
- 选择器只支持类型、`*`、`#id`、`.class`、属性选择器（`=`、`~=`、`|=`、`^=`、`$=`、`*=`）、`:first-child`、`:last-child`、`:only-child`、`:empty`、四种组合符和选择器列表。
- 不支持 `window.onerror`，请改用 `addEventListener("error", …)`。

## TypeScript

框架自己定义 JSX 类型，原生组件需要应用自行声明，例如 React：

```ts
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "scroll-view": HTMLAttributes<HTMLElement> & { "scroll-x"?: boolean; "scroll-y"?: boolean };
    }
  }
}
```

Vue 需要在 `compilerOptions.isCustomElement` 中放行带 `-` 的原生组件名，见 [`examples/vue`](../../examples/vue)。
