import { describe, expect, test } from "vite-plus/test";

import type { Element } from "../src/dom/element";
import type { Node } from "../src/dom/node";
import { document, window } from "../src/index";
import { flush, setSink } from "../src/update";

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

function createView() {
  const view = { data: {} as Record<string, unknown>, patches: [] as Record<string, unknown>[] };
  setSink({
    setData(patch) {
      view.patches.push(patch);
      for (const [path, value] of Object.entries(patch)) {
        applyPath(view.data, path, structuredClone(value));
      }
    },
  });
  return view;
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
  test("incremental patches keep the view equal to a full serialization", () => {
    const view = createView();
    const body = document.body;
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
      expect(normalize(view.data.root)).toEqual(normalize(body.$serialize()));
    }
  });

  test("appending only sends the new children", () => {
    const view = createView();
    const list = document.createElement("ul");
    document.body.replaceChildren(list);
    flush();
    view.patches.length = 0;

    const item = document.createElement("li");
    item.textContent = "a";
    list.appendChild(item);
    item.setAttribute("class", "x"); // covered by the appended subtree
    flush();

    expect(view.patches).toEqual([{ "root.cn[0].cn[0]": item.$serialize() }]);
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
