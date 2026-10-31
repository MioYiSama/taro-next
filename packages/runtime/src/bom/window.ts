import { Comment, Text } from "../dom/character-data";
import { Document } from "../dom/document";
import {
  Element,
  HTMLElement,
  HTMLIFrameElement,
  HTMLMediaElement,
  SVGElement,
} from "../dom/element";
import {
  CustomEvent,
  ErrorEvent,
  Event,
  FocusEvent,
  HashChangeEvent,
  KeyboardEvent,
  PopStateEvent,
} from "../dom/event";
import {
  EventTarget,
  GLOBAL_EVENT_HANDLERS,
  defineEventHandlers,
  setErrorReporter,
} from "../dom/event-target";
import { DocumentFragment } from "../dom/fragment";
import { Node } from "../dom/node";
import { CSSStyleDeclaration } from "../dom/style";
import { VIEW_EVENTS, viewEvents } from "../dom/view-events";
import { setRoot } from "../update";
import { History, Location, searchOf } from "./history";
import { MediaQueryList, matchMedia, updateMediaQueries } from "./media";
import { Storage, memoryBackend, wxBackend } from "./storage";
import { appBaseInfo, deviceInfo, resetSystemInfo, windowInfo } from "./system";

const hasWx = typeof wx !== "undefined";
const timeOrigin = Date.now();

export const performance = {
  timeOrigin,
  now: (): number => Date.now() - timeOrigin,
};

export function queueMicrotask(callback: () => void): void {
  Promise.resolve()
    .then(callback)
    .catch((error: unknown) =>
      setTimeout(() => {
        throw error;
      }),
    );
}

// All callbacks requested for the same frame run together with one timestamp.
let frameCallbacks = new Map<number, (time: number) => void>();
let frameId = 0;
let frameTimer: number | null = null;

export function requestAnimationFrame(callback: (time: number) => void): number {
  frameCallbacks.set(++frameId, callback);
  frameTimer ??= setTimeout(() => {
    const callbacks = frameCallbacks;
    frameCallbacks = new Map();
    frameTimer = null;
    const time = performance.now();
    for (const cb of callbacks.values()) cb(time);
  }, 16);
  return frameId;
}

export function cancelAnimationFrame(id: number): void {
  frameCallbacks.delete(id);
}

/** Only inline styles exist; computed values are resolved by the view layer. */
export function getComputedStyle(element: Element): CSSStyleDeclaration {
  return element.style;
}

export class Navigator {
  readonly cookieEnabled = false;
  readonly onLine = true;
  readonly vendor = "";
  readonly maxTouchPoints = 10;

  get language(): string {
    return (appBaseInfo().language ?? "zh_CN").replace("_", "-");
  }

  get languages(): string[] {
    return [this.language];
  }

  get platform(): string {
    return deviceInfo().platform ?? "";
  }

  get userAgent(): string {
    if (!hasWx) return "MiniProgram";
    const device = deviceInfo();
    const base = appBaseInfo();
    return `Mozilla/5.0 (${device.system}; ${device.model}) AppleWebKit/537.36 (KHTML, like Gecko) MicroMessenger/${base.version} MiniProgramEnv/${device.platform}`;
  }
}

/**
 * Custom elements are not supported. Declared as `undefined`, like browser
 * contexts without the registry, so feature checks (Svelte's, for native
 * components with a `-` in their name) see it missing instead of throwing a
 * `ReferenceError`.
 */
export const customElements: undefined = undefined;

export class Window extends EventTarget {
  readonly document: Document;
  readonly history: History;
  readonly navigator = new Navigator();
  readonly localStorage = new Storage(hasWx ? wxBackend() : memoryBackend());
  readonly sessionStorage = new Storage(memoryBackend());
  readonly performance = performance;
  readonly closed = false;
  readonly name = "";
  readonly customElements = customElements;

  readonly Event = Event;
  readonly CustomEvent = CustomEvent;
  readonly ErrorEvent = ErrorEvent;
  readonly FocusEvent = FocusEvent;
  readonly KeyboardEvent = KeyboardEvent;
  readonly PopStateEvent = PopStateEvent;
  readonly HashChangeEvent = HashChangeEvent;
  readonly EventTarget = EventTarget;
  readonly Node = Node;
  readonly Element = Element;
  readonly HTMLElement = HTMLElement;
  readonly HTMLIFrameElement = HTMLIFrameElement;
  readonly HTMLMediaElement = HTMLMediaElement;
  readonly SVGElement = SVGElement;
  readonly Text = Text;
  readonly Comment = Comment;
  readonly DocumentFragment = DocumentFragment;
  readonly Document = Document;
  readonly CSSStyleDeclaration = CSSStyleDeclaration;
  readonly MediaQueryList = MediaQueryList;

  readonly requestAnimationFrame = requestAnimationFrame;
  readonly cancelAnimationFrame = cancelAnimationFrame;
  readonly queueMicrotask = queueMicrotask;
  readonly getComputedStyle = getComputedStyle;
  readonly matchMedia = matchMedia;
  readonly setTimeout = (handler: () => void, timeout?: number, ...args: unknown[]) =>
    setTimeout(handler, timeout, ...args);
  readonly clearTimeout = (id?: number) => clearTimeout(id);
  readonly setInterval = (handler: () => void, timeout?: number, ...args: unknown[]) =>
    setInterval(handler, timeout, ...args);
  readonly clearInterval = (id?: number) => clearInterval(id);

  /** @internal */ $location: Location;

  constructor() {
    super();
    this.document = new Document();
    this.document.defaultView = this;
    this.history = new History(this);
    this.$location = new Location(this.history);
    if (typeof wx !== "undefined" && typeof wx.getLaunchOptionsSync === "function") {
      const search = searchOf(wx.getLaunchOptionsSync().query);
      if (search) this.history.replaceState(null, "", search);
    }
  }

  get window(): this {
    return this;
  }

  get self(): this {
    return this;
  }

  get globalThis(): this {
    return this;
  }

  get parent(): this {
    return this;
  }

  get top(): this {
    return this;
  }

  get location(): Location {
    return this.$location;
  }

  set location(url: string | Location) {
    this.$location.href = String(url);
  }

  get innerWidth(): number {
    return windowInfo().windowWidth ?? 0;
  }

  get innerHeight(): number {
    return windowInfo().windowHeight ?? 0;
  }

  get outerWidth(): number {
    return windowInfo().screenWidth ?? 0;
  }

  get outerHeight(): number {
    return windowInfo().screenHeight ?? 0;
  }

  get devicePixelRatio(): number {
    return windowInfo().pixelRatio ?? 1;
  }

  get screen() {
    const info = windowInfo();
    const width = info.screenWidth ?? 0;
    const height = info.screenHeight ?? 0;
    return {
      width,
      height,
      availWidth: width,
      availHeight: height,
      colorDepth: 24,
      pixelDepth: 24,
    };
  }

  get scrollX(): number {
    return 0;
  }

  get scrollY(): number {
    return this.$scrollTop;
  }

  get pageXOffset(): number {
    return 0;
  }

  get pageYOffset(): number {
    return this.$scrollTop;
  }

  /** @internal Updated from the page's `onPageScroll` when it is enabled. */
  $scrollTop = 0;

  scrollTo(xOrOptions?: number | { top?: number; behavior?: string }, y?: number): void {
    const top = typeof xOrOptions === "object" ? xOrOptions.top : y;
    if (top === undefined || !hasWx) return;
    const smooth = typeof xOrOptions === "object" && xOrOptions.behavior === "smooth";
    wx.pageScrollTo({ scrollTop: top, duration: smooth ? 300 : 0 });
  }

  scroll(xOrOptions?: number | { top?: number; behavior?: string }, y?: number): void {
    this.scrollTo(xOrOptions, y);
  }

  alert(message?: unknown): void {
    if (hasWx) wx.showModal({ content: String(message ?? ""), showCancel: false });
  }

  /** @internal The system info changed (`onResize`). */
  $resize(): void {
    resetSystemInfo();
    updateMediaQueries();
    this.dispatchEvent(new Event("resize"));
  }

  /** @internal The system theme changed. */
  $themeChange(): void {
    resetSystemInfo();
    updateMediaQueries();
  }

  /** Views bind the events listened to on the window too, see `Element.$nodeName`. */
  override $listenersChanged(type: string): void {
    if (!(type in VIEW_EVENTS)) return;
    this.document.$refreshBindings(viewEvents(this));
  }
}

// `window.onerror` takes different arguments (`OnErrorEventHandler`) and is
// not supported: listen to `error` instead.
defineEventHandlers(Window.prototype, [
  ...GLOBAL_EVENT_HANDLERS.filter((type) => type !== "error"),
  "hashchange",
  "popstate",
]);

export const window = new Window();
export const document = window.document;
export const navigator = window.navigator;
export const location = window.location;
export const history = window.history;
export const localStorage = window.localStorage;
export const sessionStorage = window.sessionStorage;
export const screen = window.screen;

setRoot(document.body);

setErrorReporter((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const event = new ErrorEvent("error", { cancelable: true, error, message });
  if (window.dispatchEvent(event)) {
    setTimeout(() => {
      throw error;
    });
  }
});

if (hasWx) wx.onThemeChange?.(() => window.$themeChange());
