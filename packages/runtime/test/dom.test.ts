import { describe, expect, test, vi } from "vite-plus/test";

import { handleEvent } from "../src/events";
import { createAppConfig } from "../src/app";
import { config } from "../src/config";
import { appBaseInfo, deviceInfo, resetSystemInfo, windowInfo } from "../src/bom/system";
import { pxToRpx } from "../src/dom/style";
import {
  document,
  Element,
  Event,
  FocusEvent,
  history,
  HTMLElement,
  HTMLMediaElement,
  KeyboardEvent,
  location,
  MutationObserver,
  PopStateEvent,
  SVGElement,
  window,
} from "../src/index";

describe("events", () => {
  test("capture, target and bubble phases run in DOM order and stop on stopPropagation", () => {
    const outer = document.createElement("div");
    const inner = document.createElement("span");
    outer.appendChild(inner);
    document.body.replaceChildren(outer);
    const calls: string[] = [];
    window.addEventListener("click", () => calls.push("window bubble"));
    outer.addEventListener("click", () => calls.push("outer capture"), true);
    outer.addEventListener("click", (e) => {
      calls.push("outer bubble");
      e.stopPropagation();
    });
    inner.addEventListener("click", () => calls.push("inner"));
    inner.addEventListener("click", (e) => calls.push(`inner capture ${e.eventPhase}`), true);
    document.body.addEventListener("click", () => calls.push("body bubble"));

    inner.dispatchEvent(new Event("click", { bubbles: true }));

    expect(calls).toEqual(["outer capture", "inner capture 2", "inner", "outer bubble"]);
  });

  test("a native event bubbling through several bound nodes is dispatched once, from its target", () => {
    const parent = document.createElement("div");
    const button = document.createElement("button");
    parent.appendChild(button);
    document.body.replaceChildren(parent);
    const targets: unknown[] = [];
    parent.addEventListener("click", (e) => targets.push(e.target));

    const native = (currentTarget: { sid: string }) => ({
      type: "tap",
      timeStamp: 1000,
      target: { id: button.sid, dataset: { sid: button.sid } },
      currentTarget: { id: currentTarget.sid, dataset: { sid: currentTarget.sid } },
      detail: { x: 1, y: 2 },
    });
    // The view calls the handler of every bound node on the bubbling path.
    handleEvent(native(button));
    handleEvent(native(parent));

    expect(targets).toEqual([button]);
  });

  test("input events update the element value before listeners run", () => {
    const input = document.createElement("input");
    document.body.replaceChildren(input);
    let seen: unknown;
    input.addEventListener("input", (e) => (seen = (e.currentTarget as typeof input).value));

    handleEvent({
      type: "input",
      timeStamp: 2000,
      target: { id: input.sid, dataset: { sid: input.sid } },
      currentTarget: { id: input.sid, dataset: { sid: input.sid } },
      detail: { value: "typed" },
    });

    expect(seen).toBe("typed");
  });

  test("input events bypass value setters installed on the element, like React's value tracking", () => {
    const input = document.createElement("input");
    document.body.replaceChildren(input);
    // What React's inputValueTracking does: shadow `value` to record JS writes.
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!;
    let tracked = "";
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => descriptor.get!.call(input),
      set: (value: string) => {
        tracked = value;
        descriptor.set!.call(input, value);
      },
    });
    let changed: unknown;
    input.addEventListener("input", () => (changed = input.value !== tracked));

    handleEvent({
      type: "input",
      timeStamp: 2500,
      target: { id: input.sid, dataset: { sid: input.sid } },
      currentTarget: { id: input.sid, dataset: { sid: input.sid } },
      detail: { value: "typed" },
    });

    expect(changed).toBe(true);
  });

  test("listeners may shadow target/currentTarget on the event, like Solid's delegation", () => {
    const button = document.createElement("button");
    document.body.replaceChildren(button);
    const seen: unknown[] = [];
    document.addEventListener("click", (e) => {
      Object.defineProperty(e, "currentTarget", { configurable: true, get: () => button });
      Object.defineProperty(e, "target", { configurable: true, value: button });
    });
    window.addEventListener("click", (e) => seen.push(e.currentTarget));

    const event = new Event("click", { bubbles: true });
    expect(button.dispatchEvent(event)).toBe(true);

    expect(seen).toEqual([button]);
  });

  test("on<type> handler properties: set, cancel with false, cleared", () => {
    const button = document.createElement("button");
    document.body.replaceChildren(button);
    const calls: unknown[] = [];

    expect(["oninput" in document, "onclick" in button, "onpopstate" in window]).toEqual([
      true,
      true,
      true,
    ]);
    button.onclick = function (this: unknown) {
      calls.push(this);
      return false;
    };
    expect(button.dispatchEvent(new Event("click", { cancelable: true }))).toBe(false);
    expect(calls).toEqual([button]);

    button.onclick = null;
    expect([button.onclick, button.$hasListeners("click")]).toEqual([null, false]);
  });
});

describe("element interfaces", () => {
  test("instanceof the element interfaces follows namespace and tag", () => {
    const div = document.createElement("div");
    const video = document.createElement("video");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const kinds = (el: unknown) =>
      [Element, HTMLElement, SVGElement, HTMLMediaElement].map((type) => el instanceof type);

    expect(kinds(div)).toEqual([true, true, false, false]);
    expect(kinds(video)).toEqual([true, true, false, true]);
    expect(kinds(svg)).toEqual([true, false, true, false]);
    // Vue picks the namespace of the whole app from its mount container.
    expect(document.body instanceof SVGElement).toBe(false);
  });

  test("subclasses (custom elements) check the prototype chain", () => {
    class Custom extends HTMLElement {}
    const custom = new Custom(document, "x-custom", "http://www.w3.org/1999/xhtml");

    expect([custom instanceof Custom, custom instanceof HTMLElement]).toEqual([true, true]);
    expect(document.createElement("div") instanceof Custom).toBe(false);
  });

  test("input type is the HTML one, text when missing or a mini program type", () => {
    const input = document.createElement("input");
    expect(input.type).toBe("text");
    input.setAttribute("type", "Number");
    expect(input.type).toBe("number");
    input.type = "digit";
    expect([input.type, input.getAttribute("type")]).toEqual(["text", "digit"]);
    expect(document.createElement("button").type).toBe("");
  });
});

describe("innerHTML", () => {
  test("parses framework template markup", () => {
    const template = document.createElement("template");
    template.innerHTML =
      '<div class="a b" data-x=1><!><input disabled value="&lt;v&gt;"><p>a &amp; b<br>c</p></div>';
    const div = template.content!.firstChild;
    if (!(div instanceof Element)) throw new Error("expected an element");

    expect(div.className).toBe("a b");
    expect(div.dataset.x).toBe("1");
    expect(div.childNodes.map((n) => n.nodeName)).toEqual(["#comment", "INPUT", "P"]);
    expect(div.querySelector("input")!.getAttribute("value")).toBe("<v>");
    expect(div.querySelector("p")!.textContent).toBe("a & bc");
    expect(div.outerHTML).toBe(
      '<div class="a b" data-x="1"><!----><input disabled="" value="<v>"><p>a &amp; b<br>c</p></div>',
    );
  });
});

describe("history", () => {
  test("location follows pushState and back() fires popstate", async () => {
    history.pushState({ page: 1 }, "", "/list?q=1#top");
    expect(location.pathname).toBe("/list");
    expect(location.search).toBe("?q=1");
    expect(location.hash).toBe("#top");

    history.pushState({ page: 2 }, "", "detail");
    expect(location.pathname).toBe("/detail");

    const { promise, resolve } = Promise.withResolvers<unknown>();
    window.addEventListener(
      "popstate",
      (e) => resolve(e instanceof PopStateEvent ? e.state : undefined),
      { once: true },
    );
    history.back();
    const state = await promise;
    expect(state).toEqual({ page: 1 });
    expect(location.href).toBe("http://localhost/list?q=1#top");
  });
});

describe("inline style wire format", () => {
  test("converts px for the view without changing authored styles", () => {
    const previous = { ...config };
    try {
      createAppConfig({ baseLevel: 16, designWidth: 750 });
      const element = document.createElement("div");
      element.style.width = "10px";
      expect(element.$serialize().st).toContain("10rpx");
      expect(element.$field("st")).toContain("10rpx");
      expect(element.style.width).toBe("10px");
    } finally {
      Object.assign(config, previous);
    }
  });
});

describe("native DOM event translation", () => {
  test("focus and blur update activeElement and dispatch bubbling focusin/focusout", () => {
    const input = document.createElement("input");
    document.body.replaceChildren(input);
    const calls: string[] = [];
    input.addEventListener("focus", (event) => {
      expect(event).toBeInstanceOf(FocusEvent);
      expect(event.bubbles).toBe(false);
      calls.push("focus");
    });
    const focusin = (event: Event) => {
      expect(event.target).toBe(input);
      expect(document.activeElement).toBe(input);
      calls.push("focusin");
    };
    const focusout = () => calls.push("focusout");
    document.body.addEventListener("focusin", focusin);
    document.body.addEventListener("focusout", focusout);
    try {
      handleEvent({
        type: "focus", timeStamp: 3000,
        target: { id: input.sid, dataset: { sid: input.sid } },
      });
      expect(document.activeElement).toBe(input);
      handleEvent({
        type: "blur", timeStamp: 3001,
        target: { id: input.sid, dataset: { sid: input.sid } },
      });
      expect(calls).toEqual(["focus", "focusin", "focusout"]);
      expect(document.activeElement).toBe(document.body);
      handleEvent({
        type: "focus", timeStamp: 3002,
        target: { id: input.sid, dataset: { sid: input.sid } },
      });
      input.remove();
      expect(document.activeElement).toBe(document.body);
    } finally {
      document.body.removeEventListener("focusin", focusin);
      document.body.removeEventListener("focusout", focusout);
    }
  });

  test("confirm syncs value and dispatches Enter keydown, confirm, then keyup", () => {
    const input = document.createElement("input");
    document.body.replaceChildren(input);
    const calls: string[] = [];
    const keyboard = (event: Event) => {
      expect(event).toBeInstanceOf(KeyboardEvent);
      const key = event as KeyboardEvent;
      expect([key.key, key.code, key.keyCode, key.which]).toEqual(["Enter", "Enter", 13, 13]);
      expect([key.bubbles, key.cancelable, key.isTrusted]).toEqual([true, true, true]);
      expect(input.value).toBe("confirmed");
      calls.push(event.type);
    };
    input.addEventListener("keydown", keyboard);
    input.addEventListener("confirm", () => calls.push("confirm"));
    input.addEventListener("keyup", keyboard);
    handleEvent({
      type: "confirm", timeStamp: 4000,
      target: { id: input.sid, dataset: { sid: input.sid } },
      detail: { value: "confirmed" },
    });
    expect(calls).toEqual(["keydown", "confirm", "keyup"]);
  });

  test("mapped checkboxes sync checked before click, input and change and ignore native tap", () => {
    const input = document.createElement("input");
    input.type = "checkbox";
    document.body.replaceChildren(input);
    expect(input.$serialize().nn).toBe("switch");
    const calls: string[] = [];
    for (const type of ["click", "input", "change"]) {
      input.addEventListener(type, (event) => {
        expect(input.checked).toBe(true);
        expect(event.bubbles).toBe(true);
        calls.push(event.type);
      });
    }
    handleEvent({
      type: "change", timeStamp: 5000,
      target: { id: input.sid, dataset: { sid: input.sid } },
      detail: { value: true },
    });
    handleEvent({
      type: "tap", timeStamp: 5001,
      target: { id: input.sid, dataset: { sid: input.sid } },
    });
    expect(input.checked).toBe(true);
    expect(calls).toEqual(["click", "input", "change"]);
  });

  test("mapped ranges translate changing and avoid duplicate input on unchanged change", () => {
    const input = document.createElement("input");
    input.type = "range";
    document.body.replaceChildren(input);
    const calls: string[] = [];
    for (const type of ["input", "change"]) {
      input.addEventListener(type, (event) => calls.push(`${event.type}:${input.value}`));
    }
    for (const [index, type, value] of [
      [0, "changing", 10], [1, "change", 10], [2, "change", 20],
    ] as const) {
      handleEvent({
        type, timeStamp: 6000 + index,
        target: { id: input.sid, dataset: { sid: input.sid } }, detail: { value },
      });
    }
    expect(calls).toEqual(["input:10", "change:10", "input:20", "change:20"]);
    input.value = "20";
    handleEvent({
      type: "change", timeStamp: 6003,
      target: { id: input.sid, dataset: { sid: input.sid } }, detail: { value: 20 },
    });
    expect(calls).toEqual(["input:10", "change:10", "input:20", "change:20", "change:20"]);
  });

  test("same-type native events at the same timestamp on different targets both dispatch", () => {
    const first = document.createElement("button");
    const second = document.createElement("button");
    document.body.replaceChildren(first, second);
    const calls: Element[] = [];
    for (const button of [first, second]) {
      button.addEventListener("click", () => calls.push(button));
      handleEvent({
        type: "tap", timeStamp: 7000,
        target: { id: button.sid, dataset: { sid: button.sid } },
      });
    }
    expect(calls).toEqual([first, second]);
  });
});

describe("namespaced attributes", () => {
  test("qualified names preserve case and namespace methods match local names", () => {
    const XLINK = "http://www.w3.org/1999/xlink";
    const element = document.createElementNS("http://www.w3.org/2000/svg", "use");
    element.setAttributeNS(XLINK, "xlink:href", "#a");
    expect(element.getAttributeNS(XLINK, "href")).toBe("#a");
    expect(element.hasAttributeNS(XLINK, "href")).toBe(true);
    element.removeAttributeNS(XLINK, "href");
    expect(element.getAttributeNS(XLINK, "href")).toBeNull();
    expect(element.hasAttributeNS(XLINK, "href")).toBe(false);
    const html = document.createElement("div");
    html.setAttributeNS(null, "viewBox", "0 0 10 10");
    expect(html.getAttributeNames()).toContain("viewBox");
    expect(html.getAttributeNS(null, "viewBox")).toBe("0 0 10 10");
    html.removeAttributeNS(null, "viewBox");
    expect(html.hasAttributeNS(null, "viewBox")).toBe(false);
  });
});

describe("MutationObserver", () => {
  test("batches childList, attribute and characterData records for a subtree in one microtask", async () => {
    const root = document.createElement("div");
    const child = document.createElement("span");
    const text = document.createTextNode("before");
    child.appendChild(text);
    root.appendChild(child);
    document.body.replaceChildren(root);
    const batches: Parameters<ConstructorParameters<typeof MutationObserver>[0]>[0][] = [];
    const observer = new MutationObserver((records) => batches.push(records));
    observer.observe(root, {
      childList: true, attributes: true, characterData: true, subtree: true,
      attributeOldValue: true, characterDataOldValue: true,
    });
    const added = document.createElement("b");
    child.appendChild(added);
    child.setAttribute("title", "one");
    child.setAttribute("title", "two");
    text.data = "after";
    expect(batches).toEqual([]);
    await Promise.resolve();
    expect(batches).toHaveLength(1);
    expect(batches[0].map((record) => record.type)).toEqual([
      "childList", "attributes", "attributes", "characterData",
    ]);
    expect(batches[0][0]).toMatchObject({
      target: child, addedNodes: [added], removedNodes: [],
      previousSibling: text, nextSibling: null,
    });
    expect(batches[0][1]).toMatchObject({ target: child, attributeName: "title", oldValue: null });
    expect(batches[0][2]).toMatchObject({ attributeName: "title", oldValue: "one" });
    expect(batches[0][3]).toMatchObject({ target: text, oldValue: "before" });
    observer.disconnect();
  });

  test("filters attributes, observes styles and namespace methods, and drains or disconnects", async () => {
    const element = document.createElement("div");
    const batches: unknown[] = [];
    const observer = new MutationObserver((records) => batches.push(records));
    observer.observe(element, { attributeFilter: ["style", "xlink:href"], attributeOldValue: true });
    element.setAttribute("title", "ignored");
    element.style.width = "10px";
    element.style.setProperty("width", "20px");
    element.style.removeProperty("width");
    element.setAttributeNS(null, "xlink:href", "#a");
    element.removeAttributeNS(null, "href");
    const records = observer.takeRecords();
    expect(records.map((record) => [record.attributeName, record.oldValue])).toEqual([
      ["style", null], ["style", "width: 10px;"], ["style", "width: 20px;"],
      ["xlink:href", null], ["xlink:href", "#a"],
    ]);
    await Promise.resolve();
    expect(batches).toEqual([]);
    element.style.cssText = "height: 5px";
    observer.disconnect();
    await Promise.resolve();
    expect(batches).toEqual([]);
  });
});

describe("native component serialization", () => {
  test("sends only authored non-empty ids and clears the id field on removal", () => {
    const element = document.createElement("div");
    expect(element.$serialize()).not.toHaveProperty("id");
    element.id = "example";
    expect(element.$serialize().id).toBe("example");
    element.removeAttribute("id");
    expect(element.$field("id")).toBe("");
    expect(element.$serialize()).not.toHaveProperty("id");
  });

  test("hover attributes force the full view while catchmove takes precedence", () => {
    const element = document.createElement("div");
    expect(element.$nodeName(0)).toBe("static-view");
    element.setAttribute("hover-class", "hovered");
    expect(element.$nodeName(0)).toBe("view");
    element.setAttribute("catchmove", "");
    expect(element.$nodeName(0)).toBe("catch-view");
    element.removeAttribute("catchmove");
    element.removeAttribute("hover-class");
    expect(element.$nodeName(0)).toBe("static-view");
  });

  test.each([
    ["number", "digit"], ["Number", "digit"], ["text", "text"],
    ["idcard", "idcard"], ["digit", "digit"], ["safe-password", "safe-password"],
    ["nickname", "nickname"], ["email", "text"], ["password", "text"],
  ])("maps HTML input type %s to native type %s", (type, nativeType) => {
    const input = document.createElement("input");
    input.type = type;
    expect(input.$serialize().type).toBe(nativeType);
    expect(input.$field("type")).toBe(nativeType);
  });

  test("maps input kinds on type changes and preserves the mapping when cloned", () => {
    const input = document.createElement("input");
    input.type = "checkbox";
    expect(input.$serialize()).toMatchObject({ nn: "switch", type: "checkbox" });
    expect((input.cloneNode() as Element).$serialize().nn).toBe("switch");
    input.type = "range";
    input.value = "25";
    expect(input.$serialize()).toMatchObject({ nn: "slider", value: 25 });
    input.removeAttribute("type");
    expect(input.$serialize().nn).toBe("input");
    expect(document.createElement("select").$component).toBe("view");
  });

  test("password type implies password unless explicitly overridden", () => {
    const input = document.createElement("input");
    input.type = "password";
    expect(input.$serialize()).toMatchObject({ type: "text", password: true });
    expect(input.$field("password")).toBe(true);
    input.setAttribute("password", false);
    expect(input.$serialize().password).toBe(false);
    input.removeAttribute("password");
    input.type = "text";
    expect(input.$field("password")).toBe(false);
  });

  test("inline px conversion matches CSS length and URL handling", () => {
    expect(pxToRpx('-1.5px .5px 0px 10PX fade-10px url("a)10px.png") URL(a-10px.png)', 375))
      .toBe('-3rpx 1rpx 0 10PX fade-10px url("a)10px.png") URL(a-10px.png)');
  });
});

describe("system information and media queries", () => {
  test("falls back to getSystemInfoSync and memoizes each information category", () => {
    const info = { windowWidth: 320, windowHeight: 640, platform: "ios", language: "en_US" };
    const legacy = vi.fn(() => info);
    vi.stubGlobal("wx", { getSystemInfoSync: legacy });
    resetSystemInfo();
    try {
      expect(windowInfo()).toBe(info);
      expect(appBaseInfo()).toBe(info);
      expect(deviceInfo()).toBe(info);
      expect(window.innerWidth).toBe(320);
      expect(window.navigator.platform).toBe("ios");
      expect(window.navigator.language).toBe("en-US");
      expect(legacy).toHaveBeenCalledTimes(3);
      resetSystemInfo();
      expect(windowInfo()).toBe(info);
      expect(legacy).toHaveBeenCalledTimes(4);
    } finally {
      vi.unstubAllGlobals();
      resetSystemInfo();
    }
  });

  test("modern information APIs refresh media queries on resize and theme changes", () => {
    let width = 320;
    let theme = "light";
    const legacy = vi.fn();
    vi.stubGlobal("wx", {
      getWindowInfo: () => ({ windowWidth: width, windowHeight: 640 }),
      getAppBaseInfo: () => ({ theme }),
      getDeviceInfo: () => ({ platform: "android" }),
      getSystemInfoSync: legacy,
    });
    resetSystemInfo();
    const size = window.matchMedia("(min-width: 600px)");
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const changes: boolean[] = [];
    const sizeChanged = () => changes.push(size.matches);
    const themeChanged = () => changes.push(dark.matches);
    size.addListener(sizeChanged);
    dark.addListener(themeChanged);
    try {
      expect([size.matches, dark.matches, deviceInfo().platform]).toEqual([false, false, "android"]);
      width = 700;
      window.$resize();
      theme = "dark";
      window.$themeChange();
      expect(changes).toEqual([true, true]);
      expect(legacy).not.toHaveBeenCalled();
    } finally {
      size.removeListener(sizeChanged);
      dark.removeListener(themeChanged);
      vi.unstubAllGlobals();
      resetSystemInfo();
    }
  });

  test("returns empty information without wx", () => {
    vi.stubGlobal("wx", undefined);
    resetSystemInfo();
    try {
      expect([windowInfo(), appBaseInfo(), deviceInfo()]).toEqual([{}, {}, {}]);
      expect(windowInfo()).toBe(windowInfo());
    } finally {
      vi.unstubAllGlobals();
      resetSystemInfo();
    }
  });
});
