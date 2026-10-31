import type { EventTarget } from "./event-target";

export interface EventInit {
  bubbles?: boolean;
  cancelable?: boolean;
  composed?: boolean;
}

export class Event {
  static readonly NONE = 0;
  static readonly CAPTURING_PHASE = 1;
  static readonly AT_TARGET = 2;
  static readonly BUBBLING_PHASE = 3;
  readonly NONE = 0;
  readonly CAPTURING_PHASE = 1;
  readonly AT_TARGET = 2;
  readonly BUBBLING_PHASE = 3;

  type: string;
  bubbles: boolean;
  cancelable: boolean;
  composed: boolean;
  target: EventTarget | null = null;
  currentTarget: EventTarget | null = null;
  eventPhase = 0;
  defaultPrevented = false;
  isTrusted = false;
  timeStamp = Date.now();

  /** @internal */ $stop = false;
  /** @internal */ $stopImmediate = false;
  /** @internal */ $path: EventTarget[] = [];

  constructor(type: string, init: EventInit = {}) {
    this.type = String(type);
    this.bubbles = !!init.bubbles;
    this.cancelable = !!init.cancelable;
    this.composed = !!init.composed;
  }

  /** Legacy initializer, used with `document.createEvent()`. */
  initEvent(type: string, bubbles = false, cancelable = false): void {
    this.type = String(type);
    this.bubbles = bubbles;
    this.cancelable = cancelable;
  }

  get srcElement(): EventTarget | null {
    return this.target;
  }

  get cancelBubble(): boolean {
    return this.$stop;
  }

  set cancelBubble(value: boolean) {
    if (value) this.$stop = true;
  }

  get returnValue(): boolean {
    return !this.defaultPrevented;
  }

  set returnValue(value: boolean) {
    if (!value) this.preventDefault();
  }

  composedPath(): EventTarget[] {
    return this.$path.slice();
  }

  stopPropagation(): void {
    this.$stop = true;
  }

  stopImmediatePropagation(): void {
    this.$stop = this.$stopImmediate = true;
  }

  preventDefault(): void {
    if (this.cancelable) this.defaultPrevented = true;
  }
}

export interface CustomEventInit<T = unknown> extends EventInit {
  detail?: T;
}

export class CustomEvent<T = unknown> extends Event {
  detail: T;

  constructor(type: string, init: CustomEventInit<T> = {}) {
    super(type, init);
    this.detail = init.detail as T;
  }

  initCustomEvent(type: string, bubbles = false, cancelable = false, detail?: T): void {
    this.initEvent(type, bubbles, cancelable);
    this.detail = detail as T;
  }
}

export interface PopStateEventInit extends EventInit {
  state?: unknown;
}

export class PopStateEvent extends Event {
  readonly state: unknown;

  constructor(type: string, init: PopStateEventInit = {}) {
    super(type, init);
    this.state = init.state ?? null;
  }
}

export interface HashChangeEventInit extends EventInit {
  oldURL?: string;
  newURL?: string;
}

export class HashChangeEvent extends Event {
  readonly oldURL: string;
  readonly newURL: string;

  constructor(type: string, init: HashChangeEventInit = {}) {
    super(type, init);
    this.oldURL = init.oldURL ?? "";
    this.newURL = init.newURL ?? "";
  }
}

export interface ErrorEventInit extends EventInit {
  message?: string;
  error?: unknown;
}

export class ErrorEvent extends Event {
  readonly message: string;
  readonly error: unknown;

  constructor(type: string, init: ErrorEventInit = {}) {
    super(type, init);
    this.message = init.message ?? "";
    this.error = init.error;
  }
}

/** A touch point as delivered by the mini program. */
export interface Touch {
  identifier: number;
  pageX: number;
  pageY: number;
  clientX: number;
  clientY: number;
  force?: number;
}

/** Native event as delivered to a WXML event handler. */
export interface MpEvent {
  type: string;
  timeStamp: number;
  target?: { id: string; dataset: Record<string, unknown> };
  currentTarget?: { id: string; dataset: Record<string, unknown> };
  detail?: unknown;
  touches?: Touch[];
  changedTouches?: Touch[];
}

/**
 * DOM event created from a native mini program event. Carries the native
 * `detail` and touches, plus mouse-like coordinates for `click`.
 */
export class MiniProgramEvent<T = unknown> extends CustomEvent<T> {
  touches: Touch[];
  changedTouches: Touch[];
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
  readonly button = 0;
  /** The raw mini program event. */
  readonly mpEvent: MpEvent;

  constructor(type: string, init: CustomEventInit<T>, mpEvent: MpEvent) {
    super(type, init);
    this.isTrusted = true;
    this.mpEvent = mpEvent;
    this.touches = mpEvent.touches ?? [];
    this.changedTouches = mpEvent.changedTouches ?? [];
    // Touch events carry touches, `tap` carries its position in `detail`.
    const point: Partial<Touch & { x: number; y: number }> | undefined =
      this.changedTouches[0] ?? (init.detail as { x?: number; y?: number } | undefined);
    this.clientX = point?.clientX ?? point?.x ?? 0;
    this.clientY = point?.clientY ?? point?.y ?? 0;
    this.pageX = point?.pageX ?? point?.x ?? 0;
    this.pageY = point?.pageY ?? point?.y ?? 0;
  }
}
