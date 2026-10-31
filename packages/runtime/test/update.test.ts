import { afterEach, describe, expect, test } from "vite-plus/test";

import { config } from "../src/config";
import type { Element } from "../src/dom/element";
import type { Node } from "../src/dom/node";
import { document, window } from "../src/index";
import {
  type DataSink,
  attachBoundary,
  detachBoundary,
  findNode,
  flush,
  nextTick,
  setSink,
} from "../src/update";

/** Apply `setData` paths (`root.cn[0].v`) the way the mini program view does. */
function applyPath(data: Record<string, unknown>, path: string, value: unknown): void {
  const keys: Array<string | number> = [];
  path.replace(/[^.[\]]+|\[(\d+)\]/g, (match, index?: string) => {
    keys.push(index === undefined ? match : Number(index));
    return match;
  });
  let target = data as Record<string | number, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    target[keys[i]] ??= typeof keys[i + 1] === "number" ? [] : {};
    target = target[keys[i]] as Record<string | number, unknown>;
  }
  target[keys[keys.length - 1]] = value;
}

interface TestView {
  data: Record<string, unknown>;
  patches: Record<string, unknown>[];
  sink: DataSink;
}

function createDataView(data: Record<string, unknown> = {}): TestView {
  const view = { data, patches: [] as Record<string, unknown>[] };
  const sink: DataSink = {
    setData(patch, callback) {
      view.patches.push(patch);
      for (const [path, value] of Object.entries(patch)) {
        applyPath(view.data, path, structuredClone(value));
      }
      callback?.();
    },
  };
  return { ...view, sink };
}

function createView() {
  const view = createDataView();
  setSink(view.sink);
  return view;
}

/** Model component properties separately from each component's own `setData`. */
function createBoundaryView(page: TestView): () => unknown {
  const components = new Map<Node, { view: TestView; source: unknown }>();
  return () => {
    const seen = new Set<Node>();
    const walk = (value: unknown, depth: number): unknown => {
      let data = value as Record<string, unknown>;
      const node = findNode(data.sid as string);
      if (node && depth > 0 && depth % config.baseLevel === 0) {
        seen.add(node);
        let component = components.get(node);
        if (!component) {
          component = { view: createDataView({ i: structuredClone(data) }), source: value };
          components.set(node, component);
          attachBoundary(node, component.view.sink);
        } else if (component.source !== value) {
          // A parent resend updates `i`, just as the template property does.
          component.view.data.i = structuredClone(data);
          component.source = value;
        }
        data = component.view.data.i as Record<string, unknown>;
      }
      const result = { ...data };
      if (Array.isArray(data.cn)) result.cn = data.cn.map((child) => walk(child, depth + 1));
      return result;
    };
    const tree = walk(page.data.root, 0);
    for (const [node, component] of components) {
      if (!seen.has(node)) {
        detachBoundary(component.view.sink);
        components.delete(node);
      }
    }
    return tree;
  };
}

/**
 * Drop fields that render the same as a missing one (`''`, `null`, `[]`), so
 * an incrementally patched view compares equal to a fresh serialization.
 */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field === "" || field === null || (Array.isArray(field) && !field.length)) continue;
    result[key] = normalize(field);
  }
  return result;
}
/** Deterministic PRNG so failures reproduce. */
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("setData batching", () => {
  afterEach(() => {
    setSink(null);
    config.baseLevel = 16;
  });

  test.each([false, true])("randomized updates (boundaries: %s)", (boundaries) => {
    config.baseLevel = boundaries ? 2 : 16;
    document.body.replaceChildren();
    document.body.$listeners = null;
    const view = createView();
    const body = document.body;
    const effectiveTree = boundaries ? createBoundaryView(view) : () => view.data.root;
    effectiveTree();
    const rand = random(42);
    const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
    const all = (): Node[] => {
      const nodes: Node[] = [];
      const walk = (node: Node) => {
        nodes.push(node);
        node.childNodes.forEach(walk);
      };
      walk(body);
      return nodes;
    };
    const handler = () => {};

    for (let round = 0; round < 200; round++) {
      for (let op = 0; op < 8; op++) {
        const nodes = all();
        const elements = nodes.filter((n): n is Element => n.nodeType === 1);
        const parent = pick(elements);
        const roll = rand();
        if (roll < 0.3) {
          const child =
            rand() < 0.3
              ? document.createTextNode(`t${round}`)
              : document.createElement(pick(["div", "span", "scroll-view", "button"]));
          parent.insertBefore(child, rand() < 0.5 ? null : (pick(parent.childNodes) ?? null));
        } else if (roll < 0.45) {
          const node = pick(nodes);
          if (node !== body) node.remove();
        } else if (roll < 0.55) {
          // Move an existing node somewhere else in the tree.
          const node = pick(nodes);
          if (node !== body && !node.contains(parent)) parent.appendChild(node);
        } else if (roll < 0.65) {
          const text = nodes.find((n) => n.nodeType === 3 && rand() < 0.3);
          if (text) text.textContent = `changed ${round}`;
        } else if (roll < 0.75) {
          const el = pick(elements);
          if (rand() < 0.5) el.setAttribute(pick(["class", "id", "scroll-y", "hidden"]), `v${op}`);
          else el.removeAttribute(pick(["class", "id", "scroll-y", "hidden"]));
        } else if (roll < 0.85) {
          pick(elements).style.setProperty("color", rand() < 0.5 ? "red" : "");
        } else {
          const el = pick(elements);
          if (rand() < 0.5) el.addEventListener(pick(["click", "touchstart"]), handler);
          else el.removeEventListener("click", handler);
        }
      }
      flush();
      expect(normalize(effectiveTree())).toEqual(normalize(body.$serialize()));
    }
  });

  test("appending only sends the new children", () => {
    const view = createView();
    const list = document.createElement("ul");
    list.append(document.createElement("li"));
    document.body.replaceChildren(list);
    flush();
    view.patches.length = 0;

    const item = document.createElement("li");
    item.textContent = "a";
    list.appendChild(item);
    item.setAttribute("class", "x"); // covered by the appended subtree
    flush();

    expect(view.patches).toEqual([{ "root.cn[0].cn[1]": item.$serialize() }]);
  });

  test("inserting before existing children sends only the shifted tail", () => {
    const view = createView();
    const list = document.createElement("ul");
    const children = ["a", "b", "c"].map((text) => {
      const child = document.createElement("li");
      child.textContent = text;
      return child;
    });
    list.append(...children);
    document.body.replaceChildren(list);
    flush();
    view.patches.length = 0;

    const child = document.createElement("li");
    child.textContent = "second";
    list.insertBefore(child, children[1]);
    flush();

    expect(view.patches).toEqual([
      {
        "root.cn[0].cn[1]": child.$serialize(),
        "root.cn[0].cn[2]": children[1].$serialize(),
        "root.cn[0].cn[3]": children[2].$serialize(),
      },
    ]);

    // A tail starting at the first child is the whole list: one key is smaller.
    view.patches.length = 0;
    list.prepend(document.createElement("li"));
    flush();
    expect(Object.keys(view.patches[0])).toEqual(["root.cn[0].cn"]);
  });

  test("a move within the parent does not resend the list", () => {
    const view = createView();
    const list = document.createElement("ul");
    const children = ["a", "b", "c"].map((text) => {
      const child = document.createElement("li");
      child.textContent = text;
      return child;
    });
    list.append(...children);
    document.body.replaceChildren(list);
    flush();
    view.patches.length = 0;

    list.insertBefore(children[2], children[1]);
    flush();

    expect(view.patches).toEqual([
      {
        "root.cn[0].cn[1]": children[2].$serialize(),
        "root.cn[0].cn[2]": children[1].$serialize(),
      },
    ]);
    expect(normalize(view.data.root)).toEqual(normalize(document.body.$serialize()));
  });

  test("updates of detached nodes are not sent", () => {
    const view = createView();
    const div = document.createElement("div");
    document.body.replaceChildren(div);
    flush();
    view.patches.length = 0;

    div.remove();
    div.setAttribute("class", "gone");
    flush();

    expect(view.patches).toEqual([{ "root.cn": [] }]);
  });

  test("boundary updates are grouped by sink and nextTick waits for every callback", () => {
    config.baseLevel = 2;
    const parent = document.createElement("div");
    const boundary = document.createElement("div");
    const text = document.createTextNode("before");
    boundary.appendChild(text);
    parent.appendChild(boundary);
    document.body.replaceChildren(parent);
    const page = createDataView();
    const component = createDataView({ i: structuredClone(boundary.$serialize()) });
    const callbacks: Array<() => void> = [];
    const delayed = (view: TestView): DataSink => ({
      setData(patch, callback) {
        view.sink.setData(patch);
        if (callback) callbacks.push(callback);
      },
    });
    setSink(delayed(page));
    page.patches.length = 0;
    const old = createDataView();
    attachBoundary(boundary, old.sink);
    attachBoundary(boundary, delayed(component));
    detachBoundary(old.sink);

    text.data = "after";
    boundary.className = "boundary";
    document.body.className = "page";
    let applied = 0;
    nextTick(() => applied++);
    flush();

    expect(old.patches).toEqual([]);
    expect(page.patches).toEqual([{ "root.cl": document.body.$class() }]);
    expect(component.patches).toEqual([
      {
        "i.cn[0].v": "after",
        "i.cl": boundary.$class(),
      },
    ]);
    expect(callbacks).toHaveLength(2);
    expect(applied).toBe(0);
    callbacks[0]();
    expect(applied).toBe(0);
    callbacks[1]();
    expect(applied).toBe(1);
  });

  test("moved boundaries fall back to the page and page unload clears registrations", () => {
    config.baseLevel = 2;
    const parent = document.createElement("div");
    const boundary = document.createElement("div");
    const text = document.createTextNode("before");
    boundary.appendChild(text);
    parent.appendChild(boundary);
    document.body.replaceChildren(parent);
    const page = createView();
    const component = createDataView({ i: structuredClone(boundary.$serialize()) });
    attachBoundary(boundary, component.sink);

    document.body.appendChild(boundary);
    flush();
    page.patches.length = 0;
    text.data = "moved";
    flush();
    expect(component.patches).toEqual([]);
    expect(page.patches).toEqual([{ "root.cn[1].cn[0].v": "moved" }]);

    parent.appendChild(boundary);
    flush();
    setSink(null);
    setSink(page.sink);
    page.patches.length = 0;
    text.data = "reloaded";
    flush();
    expect(component.patches).toEqual([]);
    expect(page.patches).toEqual([{ "root.cn[0].cn[0].cn[0].v": "reloaded" }]);
  });

  test("sibling links stay consistent for parsed, moved and removed nodes", () => {
    const parent = document.createElement("div");
    parent.innerHTML = "<span>a</span>text<!--comment--><span>b</span>";
    const [first, text, comment, last] = parent.childNodes;
    expect(first.nextSibling).toBe(text);
    expect(text.previousSibling).toBe(first);
    expect((first as Element).nextElementSibling).toBe(last);
    expect((last as Element).previousElementSibling).toBe(first);

    parent.insertBefore(last, first);
    expect(last.previousSibling).toBeNull();
    expect(last.nextSibling).toBe(first);
    expect(first.previousSibling).toBe(last);
    expect(comment.nextSibling).toBeNull();
    text.remove();
    expect(first.nextSibling).toBe(comment);
    expect(comment.previousSibling).toBe(first);
    expect(text.nextSibling).toBeNull();
    expect(text.previousSibling).toBeNull();
  });

  test("dataset is cached while remaining live", () => {
    const element = document.createElement("div");
    const dataset = element.dataset;
    expect(element.dataset).toBe(dataset);
    element.setAttribute("data-item-id", "one");
    expect(dataset.itemId).toBe("one");
    dataset.itemId = "two";
    expect(element.getAttribute("data-item-id")).toBe("two");
    delete dataset.itemId;
    expect(element.hasAttribute("data-item-id")).toBe(false);
  });

  test("views bind the touch events listened to on them, their ancestors, the document and the window", () => {
    document.body.$listeners = null; // Left over by the randomized test.
    const view = createView();
    const outer = document.createElement("div");
    const inner = document.createElement("span");
    outer.appendChild(inner);
    document.body.replaceChildren(outer);
    const listener = () => {};
    const names = () => {
      flush();
      const root = view.data.root as { cn: Array<{ nn: string; cn: Array<{ nn: string }> }> };
      return [root.cn[0].nn, root.cn[0].cn[0].nn];
    };
    expect(names()).toEqual(["static-view", "static-view"]);

    // Not bound by views.
    document.addEventListener("input", listener);
    expect(names()).toEqual(["static-view", "static-view"]);

    // Delegation: the tapped node must bind `tap` itself, as native events
    // don't bubble out of the `comp` component rendering deep subtrees.
    document.addEventListener("click", listener);
    expect(names()).toEqual(["click-view", "click-view"]);
    window.addEventListener("touchstart", listener);
    expect(names()).toEqual(["view", "view"]);
    window.removeEventListener("touchstart", listener);
    document.removeEventListener("click", listener);
    document.removeEventListener("input", listener);
    expect(names()).toEqual(["static-view", "static-view"]);

    inner.addEventListener("click", listener);
    expect(names()).toEqual(["static-view", "click-view"]);
    outer.addEventListener("touchstart", listener);
    expect(names()).toEqual(["view", "view"]);
  });
});
