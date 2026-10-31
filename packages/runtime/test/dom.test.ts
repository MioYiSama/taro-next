import { describe, expect, test } from "vite-plus/test";

import { handleEvent } from "../src/app";
import {
  document,
  Element,
  Event,
  history,
  HTMLElement,
  HTMLMediaElement,
  location,
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
    document.body.addEventListener("click", () => calls.push("body bubble"));

    inner.dispatchEvent(new Event("click", { bubbles: true }));

    expect(calls).toEqual(["outer capture", "inner", "outer bubble"]);
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
