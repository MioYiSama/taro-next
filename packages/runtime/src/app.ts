import { document, window } from "./bom/window";
import { COMPONENTS } from "./components";
import type { Element } from "./dom/element";
import { Event, MiniProgramEvent, type MpEvent } from "./dom/event";
import { findNode, setSink } from "./update";

type Hook = (this: unknown, ...args: never[]) => unknown;

export interface StartOptions {
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

let render: ((window: globalThis.Window) => void) | null = null;
let startOptions: StartOptions = {};
let rendered = false;
let currentPage: unknown = null;

/**
 * Register the app. `render` runs once, when the page loads, with the
 * runtime's `window`: mount your UI into `window.document.body` with any
 * DOM-based framework.
 */
export function start(fn: (window: globalThis.Window) => void, options: StartOptions = {}): void {
  if (render) throw new Error("start() must only be called once");
  render = fn;
  startOptions = options;
}

function call(hook: unknown, self: unknown, args: unknown[]): unknown {
  return typeof hook === "function" ? (hook as Hook).apply(self, args as never[]) : undefined;
}

function setVisibility(state: "visible" | "hidden"): void {
  if (document.visibilityState === state) return;
  document.visibilityState = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Events that bubble in the DOM; everything else is dispatched non-bubbling. */
const BUBBLES: Record<string, true> = {
  click: true,
  touchstart: true,
  touchmove: true,
  touchend: true,
  touchcancel: true,
  longpress: true,
  input: true,
  change: true,
  submit: true,
  reset: true,
};

/**
 * Keep element state in line with what the user did in the native component,
 * so reading `value`/`checked` works and later updates of the same value are
 * not swallowed by the view's data diff.
 *
 * Written through the attributes, not the `value`/`checked` setters: like
 * user input in a browser, it must bypass setters frameworks install on the
 * element (React's value tracking, which otherwise sees no change and skips
 * `onChange`).
 */
function syncState(element: Element, type: string, detail: Record<string, unknown>): void {
  const attrs = COMPONENTS[element.$component].attrs;
  if ((type === "input" || type === "change") && "value" in detail) {
    const value = detail.value;
    if (element.$component === "switch") element.setAttribute("checked", !!value);
    else if (element.$component === "checkbox-group" || element.$component === "radio-group") {
      const selected = Array.isArray(value) ? value.map(String) : [String(value)];
      const kind = element.$component === "checkbox-group" ? "checkbox" : "radio";
      for (const item of element.querySelectorAll(kind)) {
        item.setAttribute("checked", selected.includes(String(item.value)));
      }
    } else if ("value" in attrs) element.setAttribute("value", value ?? "");
  }
  if (type === "change" && "current" in detail && "current" in attrs) {
    element.setAttribute("current", detail.current);
  }
}

let lastEvent = "";

/** Bridge a native event (bound as `eh` in the templates) into the DOM. */
export function handleEvent(mpEvent: MpEvent): void {
  // Native tap/touch events bubble through every node binding them; the
  // first handler dispatches the DOM event, which then does its own bubbling.
  const key = `${mpEvent.type}:${mpEvent.timeStamp}`;
  if (key === lastEvent) return;
  lastEvent = key;

  const targetSid = mpEvent.target?.dataset.sid as string | undefined;
  const currentSid = mpEvent.currentTarget?.dataset.sid as string | undefined;
  const node = (targetSid && findNode(targetSid)) || (currentSid && findNode(currentSid));
  if (!node || node.nodeType !== 1) return;
  const element = node as Element;

  const detail = mpEvent.detail as Record<string, unknown> | undefined;
  if (detail && typeof detail === "object") syncState(element, mpEvent.type, detail);
  const type = mpEvent.type === "tap" ? "click" : mpEvent.type;
  const event = new MiniProgramEvent(
    type,
    { bubbles: !!BUBBLES[type], cancelable: true, detail },
    mpEvent,
  );
  element.dispatchEvent(event);
}

/** @internal Options for `App()`. */
export function createAppConfig(): Record<string, unknown> {
  const user = startOptions.app ?? {};
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
  const user = startOptions.page ?? {};
  const config: Record<string, unknown> = {
    ...user,
    data: { ...(user.data as object | undefined), root: null },
    onLoad(this: WechatMiniprogram.Page.Instance<{}, {}>, query: Record<string, string>) {
      currentPage = this;
      if (!rendered) {
        const search = Object.keys(query)
          .map((key) => `${key}=${query[key]}`)
          .join("&");
        if (search) window.history.replaceState(null, "", `?${search}`);
        rendered = true;
        render?.(window as unknown as globalThis.Window);
      }
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
    methods: { eh: handleEvent },
  };
}
