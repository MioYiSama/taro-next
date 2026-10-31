/**
 * Collects DOM mutations of the connected tree and flushes them as a single
 * `setData` per sink per tick, addressing changed fields by data path
 * (`root.cn[0].cn[2].v`).
 *
 * Paths are computed at flush time from the final tree, so they are always
 * consistent with the indexes the view holds after earlier flushes. Updates
 * inside a subtree that is re-serialized anyway (newly appended, or its
 * parent's `cn` is replaced) are dropped.
 */
import { config } from "./config";
import type { Element } from "./dom/element";
import type { Node } from "./dom/node";
import { inheritedEvents } from "./dom/view-events";

/** No child list change. */
export const CLEAN = -1;
/** The whole child list must be re-sent. */
export const FULL = -2;

export interface DataSink {
  setData(data: Record<string, unknown>, callback?: () => void): void;
}

const dirty = new Set<Node>();
const registry = new Map<string, Node>();
const boundaries = new Map<Node, DataSink>();
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
  if (!page) boundaries.clear();
  if (page) flush();
}

/** @internal Register the component rendering a boundary node as `i`. */
export function attachBoundary(node: Node, sink: DataSink): void {
  boundaries.set(node, sink);
}

/** @internal Remove only registrations owned by this component instance. */
export function detachBoundary(sink: DataSink): void {
  for (const [node, boundary] of boundaries) {
    if (boundary === sink) boundaries.delete(node);
  }
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
  if (parent.$cn !== FULL) {
    parent.$cn = parent.$cn === CLEAN ? index : Math.min(parent.$cn, index);
  }
  parent.$delta++;
  enqueue(parent);
}

/** @internal A child was removed from `parent` at `index`. */
export function enqueueRemove(parent: Node, index: number): void {
  if (parent.$cn !== FULL) {
    parent.$cn = parent.$cn === CLEAN ? index : Math.min(parent.$cn, index);
  }
  parent.$delta--;
  enqueue(parent);
}

/** @internal Re-serialize a node whose native component changed. */
export function enqueueReplace(node: Node): void {
  const parent = node.parentNode;
  if (!node.$connected || !parent) return;
  const index = parent.childNodes.indexOf(node);
  if (parent.$cn !== FULL) {
    parent.$cn = parent.$cn === CLEAN ? index : Math.min(parent.$cn, index);
  }
  enqueue(parent);
}

/** @internal A serialized field (`nn`, `cl`, `st`, `id` or an attribute key) changed. */
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

  for (const node of dirty) {
    // The view array can only shrink through a full `cn` replacement, and a
    // tail starting at 0 is the whole list: one key is smaller than n keys.
    if (node.$delta < 0 || node.$cn === 0) node.$cn = FULL;
  }
  const routeOf = createRouteResolver(root, sink);
  const updates = new Map<DataSink, Record<string, unknown>>();
  for (const node of dirty) {
    if (!node.$connected) continue;
    const route = routeOf(node);
    if (route === null) continue;
    const { sink: target, path } = route;
    const cn = node.$cn;
    if (cn === CLEAN && !node.$fields?.size) continue;
    let data = updates.get(target);
    if (!data) updates.set(target, (data = {}));
    if (cn !== CLEAN) {
      const mask = inheritedEvents(node);
      if (cn === FULL) {
        data[`${path}.cn`] = node.childNodes.map((child) => child.$serialize(mask));
      } else {
        const children = node.childNodes;
        for (let i = cn; i < children.length; i++) {
          data[`${path}.cn[${i}]`] = children[i].$serialize(mask);
        }
      }
    }
    if (node.$fields) {
      for (const key of node.$fields) data[`${path}.${key}`] = node.$field(key);
    }
  }
  clear();
  let pending = updates.size;
  const applied = done
    ? () => {
        if (--pending === 0) done();
      }
    : undefined;
  for (const [target, data] of updates) target.setData(data, applied);
  if (!updates.size) done?.();
}

function clear(): void {
  for (const node of dirty) {
    node.$cn = CLEAN;
    node.$delta = 0;
    node.$fields = null;
  }
  dirty.clear();
}

interface Route {
  sink: DataSink;
  path: string;
  depth: number;
}

/**
 * Memoize routes for this flush. An ancestor's child-list resend covers its
 * descendants, including component boundaries receiving a new `i` property.
 */
function createRouteResolver(root: Node, sink: DataSink): (node: Node) => Route | null {
  const routes = new Map<Node, Route | null>();
  routes.set(root, { sink, path: "root", depth: 0 });
  const routeOf = (node: Node): Route | null => {
    if (routes.has(node)) return routes.get(node)!;
    const parent = node.parentNode;
    let route: Route | null = null;
    if (parent) {
      const ancestor = routeOf(parent);
      if (ancestor) {
        const index = parent.childNodes.indexOf(node);
        const cn = parent.$cn;
        if (cn !== FULL && (cn === CLEAN || index < cn)) {
          const depth = ancestor.depth + 1;
          const boundary = depth > 0 && depth % config.baseLevel === 0
            ? boundaries.get(node)
            : undefined;
          route = boundary
            ? { sink: boundary, path: "i", depth }
            : { sink: ancestor.sink, path: `${ancestor.path}.cn[${index}]`, depth };
        }
      }
    }
    routes.set(node, route);
    return route;
  };
  return routeOf;
}
