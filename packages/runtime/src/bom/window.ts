import { Comment, Text } from "../dom/character-data";
import { Document } from "../dom/document";
import { Element } from "../dom/element";
import { CustomEvent, ErrorEvent, Event, HashChangeEvent, PopStateEvent } from "../dom/event";
import { EventTarget, setErrorReporter } from "../dom/event-target";
import { DocumentFragment } from "../dom/fragment";
import { Node } from "../dom/node";
import { CSSStyleDeclaration } from "../dom/style";
import { setRoot } from "../update";
import { History, Location } from "./history";
import { Storage, memoryBackend, wxBackend } from "./storage";

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

let windowInfo: WechatMiniprogram.WindowInfo | null = null;
function getWindowInfo(): Partial<WechatMiniprogram.WindowInfo> {
  if (!hasWx) return {};
  return (windowInfo ??= wx.getWindowInfo());
}

let appBaseInfo: WechatMiniprogram.AppBaseInfo | null = null;
function getAppBaseInfo(): Partial<WechatMiniprogram.AppBaseInfo> {
  if (!hasWx) return {};
  return (appBaseInfo ??= wx.getAppBaseInfo());
}

export class Navigator {
  readonly cookieEnabled = false;
  readonly onLine = true;
  readonly vendor = "";
  readonly maxTouchPoints = 10;

  get language(): string {
    return (getAppBaseInfo().language ?? "zh_CN").replace("_", "-");
  }

  get languages(): string[] {
    return [this.language];
  }

  get platform(): string {
    return hasWx ? wx.getDeviceInfo().platform : "";
  }

  get userAgent(): string {
    if (!hasWx) return "MiniProgram";
    const device = wx.getDeviceInfo();
    const base = getAppBaseInfo();
    return `Mozilla/5.0 (${device.system}; ${device.model}) AppleWebKit/537.36 (KHTML, like Gecko) MicroMessenger/${base.version} MiniProgramEnv/${device.platform}`;
  }
}

/** Evaluates a media query against the window size and the system theme. */
function evaluateMedia(query: string): boolean {
  const info = getWindowInfo();
  const width = info.windowWidth ?? 0;
  const height = info.windowHeight ?? 0;
  return query.split(",").some((part) =>
    part
      .trim()
      .toLowerCase()
      .split(/\s+and\s+/)
      .every((condition) => {
        let negate = false;
        let c = condition.trim();
        if (c.startsWith("not ")) {
          negate = true;
          c = c.slice(4).trim();
        }
        c = c.replace(/^only\s+/, "");
        let result: boolean;
        const feature = /^\(\s*([a-z-]+)\s*(?::\s*([^)]+?))?\s*\)$/.exec(c);
        if (!feature) {
          result = c === "all" || c === "screen";
        } else {
          const [, name, value = ""] = feature;
          const px = parseFloat(value);
          switch (name) {
            case "min-width":
              result = width >= px;
              break;
            case "max-width":
              result = width <= px;
              break;
            case "min-height":
              result = height >= px;
              break;
            case "max-height":
              result = height <= px;
              break;
            case "orientation":
              result = (width > height ? "landscape" : "portrait") === value;
              break;
            case "prefers-color-scheme":
              result = (getAppBaseInfo().theme ?? "light") === value;
              break;
            case "prefers-reduced-motion":
              result = value === "no-preference";
              break;
            case "hover":
            case "any-hover":
              result = value === "none";
              break;
            case "pointer":
            case "any-pointer":
              result = value === "coarse";
              break;
            default:
              result = false;
          }
        }
        return negate ? !result : result;
      }),
  );
}

export class MediaQueryList extends EventTarget {
  readonly media: string;
  onchange: ((event: Event) => void) | null = null;
  /** @internal */ $matches: boolean;

  constructor(media: string) {
    super();
    this.media = media;
    this.$matches = evaluateMedia(media);
  }

  get matches(): boolean {
    return this.$matches;
  }

  addListener(listener: (event: Event) => void): void {
    this.addEventListener("change", listener);
  }

  removeListener(listener: (event: Event) => void): void {
    this.removeEventListener("change", listener);
  }

  /** @internal Re-evaluate and fire `change` when the result flipped. */
  $update(): void {
    const matches = evaluateMedia(this.media);
    if (matches === this.$matches) return;
    this.$matches = matches;
    const event = Object.assign(new Event("change"), { matches, media: this.media });
    this.onchange?.(event);
    this.dispatchEvent(event);
  }
}

const mediaQueries = new Set<MediaQueryList>();

export function matchMedia(query: string): MediaQueryList {
  const list = new MediaQueryList(query);
  mediaQueries.add(list);
  return list;
}

export class Window extends EventTarget {
  readonly document: Document;
  readonly history: History;
  readonly navigator = new Navigator();
  readonly localStorage = new Storage(hasWx ? wxBackend() : memoryBackend());
  readonly sessionStorage = new Storage(memoryBackend());
  readonly performance = performance;
  readonly closed = false;
  readonly name = "";

  readonly Event = Event;
  readonly CustomEvent = CustomEvent;
  readonly ErrorEvent = ErrorEvent;
  readonly PopStateEvent = PopStateEvent;
  readonly HashChangeEvent = HashChangeEvent;
  readonly EventTarget = EventTarget;
  readonly Node = Node;
  readonly Element = Element;
  readonly HTMLElement = Element;
  readonly SVGElement = Element;
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
    return getWindowInfo().windowWidth ?? 0;
  }

  get innerHeight(): number {
    return getWindowInfo().windowHeight ?? 0;
  }

  get outerWidth(): number {
    return getWindowInfo().screenWidth ?? 0;
  }

  get outerHeight(): number {
    return getWindowInfo().screenHeight ?? 0;
  }

  get devicePixelRatio(): number {
    return getWindowInfo().pixelRatio ?? 1;
  }

  get screen() {
    const info = getWindowInfo();
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
    windowInfo = null;
    for (const list of mediaQueries) list.$update();
    this.dispatchEvent(new Event("resize"));
  }

  /** @internal The system theme changed. */
  $themeChange(): void {
    appBaseInfo = null;
    for (const list of mediaQueries) list.$update();
  }
}

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
