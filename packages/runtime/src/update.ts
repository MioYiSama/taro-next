/**
 * Collects DOM mutations of the connected tree and flushes them as a single
 * `setData` per tick, addressing changed fields by data path
 * (`root.cn[0].cn[2].v`).
 *
 * Paths are computed at flush time from the final tree, so they are always
 * consistent with the indexes the view holds after earlier flushes. Updates
 * inside a subtree that is re-serialized anyway (newly appended, or its
 * parent's `cn` is replaced) are dropped.
 */
import type { Element } from "./dom/element";
import type { Node } from "./dom/node";

/** No child list change. */
export const CLEAN = -1;
/** The whole child list must be re-sent. */
export const FULL = -2;

export interface DataSink {
  setData(data: Record<string, unknown>, callback?: () => void): void;
}

const dirty = new Set<Node>();
const registry = new Map<string, Node>();
let root: Element | null = null;
let sink: DataSink | null = null;
let scheduled = false;
let needsFullUpdate = true;
const flushCallbacks: Array<() => void> = [];

/** @internal Set the element serialized as the page `root` (`document.body`). */
export function setRoot(element: Element): void {
  root = element;
}

/** @internal Attach (or detach with `null`) the page receiving updates. */
export function setSink(page: DataSink | null): void {
  sink = page;
  needsFullUpdate = true;
  if (page) flush();
}

/** @internal Find a connected node by its sid. */
export function findNode(sid: string): Node | undefined {
  return registry.get(sid);
}

/** @internal Mark a subtree as attached to the document. */
export function connect(node: Node): void {
  node.$connected = true;
  registry.set(node.sid, node);
  for (const child of node.childNodes) connect(child);
}

/** @internal Mark a subtree as detached from the document. */
export function disconnect(node: Node): void {
  node.$connected = false;
  registry.delete(node.sid);
  for (const child of node.childNodes) disconnect(child);
}

/** @internal A child was inserted into `parent` at `index`. */
export function enqueueInsert(parent: Node, index: number): void {
  const append = index === parent.childNodes.length - 1;
  const cn = parent.$cn;
  if (cn >= 0 && index >= cn) {
    // Within the tail that is re-sent anyway.
  } else if (append && cn === CLEAN) {
    parent.$cn = index;
  } else {
    parent.$cn = FULL;
  }
  enqueue(parent);
}

/** @internal A child was removed from `parent` at `index`. */
export function enqueueRemove(parent: Node, index: number): void {
  const cn = parent.$cn;
  if (!(cn >= 0 && index >= cn)) parent.$cn = FULL;
  enqueue(parent);
}

/** @internal A serialized field (`nn`, `cl`, `st`, `uid` or an attribute key) changed. */
export function enqueueField(node: Node, key: string): void {
  if (!node.$connected) return;
  (node.$fields ??= new Set()).add(key);
  enqueue(node);
}

function enqueue(node: Node): void {
  dirty.add(node);
  if (!scheduled) {
    scheduled = true;
    Promise.resolve().then(flush);
  }
}

/**
 * Run `callback` after the pending updates have been applied by the view
 * (immediately scheduled if nothing is pending).
 */
export function nextTick(callback: () => void): void {
  flushCallbacks.push(callback);
  if (!scheduled) {
    scheduled = true;
    Promise.resolve().then(flush);
  }
}

/** Apply pending updates now. */
export function flush(): void {
  scheduled = false;
  if (!sink || !root) return;
  const callbacks = flushCallbacks.splice(0);
  const done = callbacks.length ? () => callbacks.forEach((cb) => cb()) : undefined;

  if (needsFullUpdate) {
    needsFullUpdate = false;
    clear();
    sink.setData({ root: root.$serialize() }, done);
    return;
  }

  const data: Record<string, unknown> = {};
  let changed = false;
  for (const node of dirty) {
    if (!node.$connected) continue;
    const path = pathOf(node, root);
    if (path === null) continue;
    changed = true;
    const cn = node.$cn;
    if (cn === FULL) {
      data[`${path}.cn`] = node.childNodes.map((child) => child.$serialize());
    } else if (cn >= 0) {
      const children = node.childNodes;
      for (let i = cn; i < children.length; i++)
        data[`${path}.cn[${i}]`] = children[i].$serialize();
    }
    if (node.$fields) {
      for (const key of node.$fields) data[`${path}.${key}`] = node.$field(key);
    }
  }
  clear();
  if (changed) sink.setData(data, done);
  else done?.();
}

function clear(): void {
  for (const node of dirty) {
    node.$cn = CLEAN;
    node.$fields = null;
  }
  dirty.clear();
}

/**
 * Data path of `node`, or `null` when it is outside of `root` or an ancestor
 * re-serializes it in this flush.
 */
function pathOf(node: Node, root: Node): string | null {
  let path = "";
  let current = node;
  while (current !== root) {
    const parent = current.parentNode;
    if (!parent) return null;
    const index = parent.childNodes.indexOf(current);
    const cn = parent.$cn;
    if (cn === FULL || (cn >= 0 && index >= cn)) return null;
    path = `.cn[${index}]${path}`;
    current = parent;
  }
  return `root${path}`;
}
