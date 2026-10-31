import type { Event } from "./event";

export type EventListener = (event: Event) => unknown;
export interface EventListenerObject {
  handleEvent(event: Event): unknown;
}
export type EventListenerOrEventListenerObject = EventListener | EventListenerObject;

export interface EventListenerOptions {
  capture?: boolean;
}

export interface AddEventListenerOptions extends EventListenerOptions {
  once?: boolean;
  passive?: boolean;
  signal?: { aborted: boolean; addEventListener(type: "abort", listener: () => void): void };
}

interface Listener {
  callback: EventListenerOrEventListenerObject;
  capture: boolean;
  once: boolean;
  removed: boolean;
}

let errorReporter = (error: unknown): void => {
  // Surface the error like a browser would (to the app's onError) without
  // aborting the dispatch of the remaining listeners.
  setTimeout(() => {
    throw error;
  });
};

/** @internal Replace how errors thrown by listeners are reported. */
export function setErrorReporter(reporter: (error: unknown) => void): void {
  errorReporter = reporter;
}

export class EventTarget {
  /** @internal */ $listeners: Map<string, Listener[]> | null = null;
  /** @internal Event handler properties (`onclick`...) set, see {@link defineEventHandlers}. */
  declare $handlers?: Map<string, (event: Event) => unknown>;

  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (!callback) return;
    const opts = typeof options === "boolean" ? { capture: options } : (options ?? {});
    const capture = !!opts.capture;
    if (opts.signal?.aborted) return;
    const map = (this.$listeners ??= new Map<string, Listener[]>());
    let list = map.get(type);
    if (!list) map.set(type, (list = []));
    if (list.some((l) => l.callback === callback && l.capture === capture)) return;
    list.push({ callback, capture, once: !!opts.once, removed: false });
    opts.signal?.addEventListener("abort", () =>
      this.removeEventListener(type, callback, { capture }),
    );
    if (list.length === 1) this.$listenersChanged();
  }

  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    const list = this.$listeners?.get(type);
    if (!list || !callback) return;
    const capture = typeof options === "boolean" ? options : !!options?.capture;
    const index = list.findIndex((l) => l.callback === callback && l.capture === capture);
    if (index < 0) return;
    list[index].removed = true;
    list.splice(index, 1);
    if (!list.length) {
      this.$listeners!.delete(type);
      this.$listenersChanged();
    }
  }

  dispatchEvent(event: Event): boolean {
    const path = this.$eventPath();
    event.$target = this;
    event.$path = path;
    event.$stop = event.$stopImmediate = false;

    for (let i = path.length - 1; i > 0 && !event.$stop; i--) {
      event.eventPhase = 1;
      invoke(path[i], event, 1);
    }
    if (!event.$stop) {
      event.eventPhase = 2;
      invoke(this, event, 2);
    }
    if (event.bubbles) {
      for (let i = 1; i < path.length && !event.$stop; i++) {
        event.eventPhase = 3;
        invoke(path[i], event, 3);
      }
    }

    event.eventPhase = 0;
    event.$currentTarget = null;
    return !event.defaultPrevented;
  }

  /** @internal Propagation path, starting with the target itself. */
  $eventPath(): EventTarget[] {
    return [this];
  }

  /** @internal Called when the set of listened event types changes. */
  $listenersChanged(): void {}

  /** @internal Whether any listener is registered, optionally for one type only. */
  $hasListeners(type?: string): boolean {
    const map = this.$listeners;
    if (!map) return false;
    return type === undefined ? map.size > 0 : map.has(type);
  }
}

function invoke(target: EventTarget, event: Event, phase: 1 | 2 | 3): void {
  const list = target.$listeners?.get(event.type);
  if (!list) return;
  event.$currentTarget = target;
  for (const listener of list.slice()) {
    if (event.$stopImmediate) break;
    if (listener.removed) continue;
    if ((phase === 1 && !listener.capture) || (phase === 3 && listener.capture)) continue;
    if (listener.once) {
      target.removeEventListener(event.type, listener.callback, { capture: listener.capture });
    }
    try {
      const callback = listener.callback;
      if (typeof callback === "function") callback.call(target, event);
      else callback.handleEvent(event);
    } catch (error) {
      errorReporter(error);
    }
  }
}

/**
 * Event handler properties (`onclick`...) shared by elements, the document
 * and the window, for the standard events the runtime dispatches. Beyond
 * `el.onclick = fn`, React feature-checks them (`"oninput" in document`)
 * before handling `onChange` of text inputs on `input` events.
 */
export const GLOBAL_EVENT_HANDLERS = [
  "animationend",
  "animationiteration",
  "animationstart",
  "blur",
  "change",
  "click",
  "error",
  "focus",
  "input",
  "load",
  "reset",
  "resize",
  "scroll",
  "submit",
  "touchcancel",
  "touchend",
  "touchmove",
  "touchstart",
  "transitionend",
];

/**
 * @internal Define the `on<type>` event handler properties of `prototype`.
 * A handler is a listener added when set and removed when cleared, so unused
 * handlers don't make views bind events; returning `false` cancels the event.
 */
export function defineEventHandlers(prototype: EventTarget, types: readonly string[]): void {
  for (const type of types) {
    const listener = function (this: EventTarget, event: Event): void {
      if (this.$handlers?.get(type)?.call(this, event) === false) event.preventDefault();
    };
    Object.defineProperty(prototype, `on${type}`, {
      configurable: true,
      enumerable: true,
      get(this: EventTarget) {
        return this.$handlers?.get(type) ?? null;
      },
      set(this: EventTarget, handler: unknown) {
        if (typeof handler === "function") {
          (this.$handlers ??= new Map()).set(type, handler as (event: Event) => unknown);
          this.addEventListener(type, listener);
        } else if (this.$handlers?.delete(type)) {
          this.removeEventListener(type, listener);
        }
      },
    });
  }
}
