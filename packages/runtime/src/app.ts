import { searchOf } from "./bom/history";
import { document, window } from "./bom/window";
import { config } from "./config";
import { Event } from "./dom/event";
import { handleEvent } from "./events";
import { attachBoundary, detachBoundary, findNode, setSink, type DataSink } from "./update";

/** The `comp` instance: renders the boundary node passed as `i`. */
type Boundary = DataSink & { data: { i: { sid: string } } };

type Hook = (this: unknown, ...args: never[]) => unknown;

export interface ConfigureOptions {
  /**
   * Extra `App()` options. Lifecycle hooks the runtime also uses (`onShow`,
   * `onHide`) are called after the runtime's own handling.
   */
  app?: Record<string, unknown>;
  /**
   * Extra `Page()` options for the single page, e.g. `onShareAppMessage`,
   * `onPullDownRefresh` or `onReachBottom`. Defining `onPageScroll` also keeps
   * `window.scrollY` up to date and fires `scroll` on `window`.
   */
  page?: Record<string, unknown>;
}

const configured: ConfigureOptions = {};
let registered = false;
let currentPage: unknown = null;

/**
 * Configure mini program options while the app entry evaluates, before
 * the build plugin registers `App()`.
 */
export function configure(options: ConfigureOptions): void {
  if (registered) {
    throw new Error(
      "configure() must be called while the app entry evaluates, before App() is registered",
    );
  }
  if (options.app) configured.app = { ...configured.app, ...options.app };
  if (options.page) configured.page = { ...configured.page, ...options.page };
}

function call(hook: unknown, self: unknown, args: unknown[]): unknown {
  return typeof hook === "function" ? (hook as Hook).apply(self, args as never[]) : undefined;
}

function setVisibility(state: "visible" | "hidden"): void {
  if (document.visibilityState === state) return;
  document.visibilityState = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

/** @internal Options for `App()`. */
export function createAppConfig(options: {
  baseLevel: number;
  designWidth: number;
}): Record<string, unknown> {
  registered = true;
  config.baseLevel = options.baseLevel;
  config.designWidth = options.designWidth;
  const user = configured.app ?? {};
  return {
    ...user,
    onShow(this: unknown, options: unknown) {
      setVisibility("visible");
      return call(user.onShow, this, [options]);
    },
    onHide(this: unknown) {
      setVisibility("hidden");
      return call(user.onHide, this, []);
    },
    $createPage: createPageConfig,
    $createComponent: createComponentConfig,
  };
}

/** @internal Options for the page's `Page()`. */
export function createPageConfig(): Record<string, unknown> {
  const user = configured.page ?? {};
  const config: Record<string, unknown> = {
    ...user,
    data: { ...(user.data as object | undefined), root: null },
    onLoad(this: WechatMiniprogram.Page.Instance<{}, {}>, query: Record<string, string>) {
      currentPage = this;
      const search = searchOf(query);
      if (search && search !== window.location.search) window.history.replaceState(null, "", search);
      setSink(this);
      return call(user.onLoad, this, [query]);
    },
    onUnload(this: unknown) {
      if (currentPage === this) {
        currentPage = null;
        setSink(null);
      }
      return call(user.onUnload, this, []);
    },
    onResize(this: unknown, options: unknown) {
      window.$resize();
      return call(user.onResize, this, [options]);
    },
    eh: handleEvent,
  };
  if (typeof user.onPageScroll === "function") {
    config.onPageScroll = function (this: unknown, options: { scrollTop: number }) {
      window.$scrollTop = options.scrollTop;
      window.dispatchEvent(new Event("scroll"));
      return call(user.onPageScroll, this, [options]);
    };
  }
  return config;
}

/**
 * @internal Options for the `comp` component, which continues rendering
 * once the template nesting reaches `baseLevel`.
 */
export function createComponentConfig(): Record<string, unknown> {
  return {
    options: { virtualHost: true, styleIsolation: "apply-shared" },
    properties: { i: { type: Object, value: {} } },
    lifetimes: {
      attached(this: Boundary) {
        const node = findNode(this.data.i.sid);
        if (node) attachBoundary(node, this);
      },
      detached(this: Boundary) {
        detachBoundary(this);
      },
    },
    methods: { eh: handleEvent },
  };
}
