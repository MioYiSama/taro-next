import type { Document } from "./document";
import type { EventTarget } from "./event-target";
import type { Node } from "./node";

export const CLICK = 1;
export const TOUCH = 2;
export const ALL_VIEW_EVENTS = CLICK | TOUCH;

/** DOM event types of the native events a `view` binds (`tap` is `click`). */
export const VIEW_EVENTS: Record<string, number> = {
  click: CLICK,
  touchstart: TOUCH,
  touchmove: TOUCH,
  touchend: TOUCH,
  touchcancel: TOUCH,
  longpress: TOUCH,
};

/** {@link VIEW_EVENTS} flags listened to on `target`. */
export function viewEvents(target: EventTarget | null): number {
  let flags = 0;
  const listeners = target?.$listeners;
  if (listeners) for (const type of listeners.keys()) flags |= VIEW_EVENTS[type] ?? 0;
  return flags;
}

/** @internal Flags inherited from a node's parent, including the window. */
export function parentEvents(node: Node): number {
  return node.parentNode
    ? inheritedEvents(node.parentNode)
    : node.nodeType === 9
      ? viewEvents((node as Document).defaultView)
      : 0;
}

/** @internal Flags listened to on a node and its ancestors. */
export function inheritedEvents(node: Node): number {
  let flags = 0;
  for (let current: Node | null = node; current; current = current.parentNode) {
    flags |= viewEvents(current);
    if (current.nodeType === 9) flags |= viewEvents((current as Document).defaultView);
    if (flags === ALL_VIEW_EVENTS) break;
  }
  return flags;
}
