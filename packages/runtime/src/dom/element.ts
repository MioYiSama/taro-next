import { type AttrDefault, COMPONENTS, HTML_TAGS, attrKey, componentOf } from "../components";
import { enqueueField } from "../update";
import { DOMTokenList } from "./class-list";
import type { Document } from "./document";
import { Event } from "./event";
import { type EventTarget, GLOBAL_EVENT_HANDLERS, defineEventHandlers } from "./event-target";
import type { DocumentFragment } from "./fragment";
import { SVG_NAMESPACE, serialize, serializeChildren, parseHTML } from "./html";
import { DOCUMENT_NODE, ELEMENT_NODE, Node } from "./node";
import { matches, querySelectorAll } from "./selector";
import { type CSSStyleDeclaration, createStyle } from "./style";

export const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

export interface Attr {
  readonly name: string;
  readonly localName: string;
  readonly value: string;
}

const defaultsCache = new Map<string, Map<string, AttrDefault>>();

/** Attribute key → default value of a component (memoized). */
function defaultsOf(component: string): Map<string, AttrDefault> {
  let defaults = defaultsCache.get(component);
  if (!defaults) {
    defaults = new Map();
    for (const [name, value] of Object.entries(COMPONENTS[component].attrs)) {
      defaults.set(attrKey(name), value);
    }
    defaultsCache.set(component, defaults);
  }
  return defaults;
}

const CLICK = 1;
const TOUCH = 2;
const ALL_VIEW_EVENTS = CLICK | TOUCH;
/** DOM event types of the native events a `view` binds (`tap` is `click`). */
const VIEW_EVENTS: Record<string, number> = {
  click: CLICK,
  touchstart: TOUCH,
  touchmove: TOUCH,
  touchend: TOUCH,
  touchcancel: TOUCH,
  longpress: TOUCH,
};

/** {@link VIEW_EVENTS} flags listened to on `target`. */
function viewEvents(target: EventTarget | null): number {
  let flags = 0;
  const listeners = target?.$listeners;
  if (listeners) for (const type of listeners.keys()) flags |= VIEW_EVENTS[type] ?? 0;
  return flags;
}

/** Values of `<input type>` in HTML, see {@link Element.type}. */
const HTML_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "email",
  "file",
  "hidden",
  "image",
  "month",
  "number",
  "password",
  "radio",
  "range",
  "reset",
  "search",
  "submit",
  "tel",
  "text",
  "time",
  "url",
  "week",
]);

/**
 * Convert an attribute value to the type the component expects, so string
 * values (e.g. set by frameworks through `setAttribute`) still work:
 * `""`/`"true"` → `true` for booleans, numeric strings → numbers.
 */
function coerce(defaultValue: AttrDefault, value: unknown): unknown {
  if (value == null) return null;
  switch (typeof defaultValue) {
    case "boolean":
      return value === "false" ? false : value === "" || !!value;
    case "number":
      return typeof value === "string" && value.trim() !== "" && Number.isFinite(+value)
        ? +value
        : value;
    case "string":
      return typeof value === "number" || typeof value === "boolean" ? String(value) : value;
    default:
      return value;
  }
}

export class Element extends Node {
  readonly localName: string;
  readonly namespaceURI: string;
  readonly tagName: string;
  /** @internal Mini program component rendering this element. */
  readonly $component: string;
  /** @internal Raw attribute values (`style` lives in {@link $style}). */
  $attrs = new Map<string, unknown>();
  /** @internal */ $style: CSSStyleDeclaration | null = null;
  /** @internal */ $classList: DOMTokenList | null = null;
  /** @internal Template content of `<template>`. */ $content: DocumentFragment | null = null;
  /** @internal Last node name sent to the view. */ $nn = "";

  constructor(ownerDocument: Node["$ownerDocument"], localName: string, namespaceURI: string) {
    super(ownerDocument);
    this.localName = localName;
    this.namespaceURI = namespaceURI;
    this.tagName = namespaceURI === HTML_NAMESPACE ? localName.toUpperCase() : localName;
    this.$component = componentOf(localName);
  }

  get nodeType(): number {
    return ELEMENT_NODE;
  }

  get nodeName(): string {
    return this.tagName;
  }

  // Attributes

  /** @internal */
  $name(name: string): string {
    return this.namespaceURI === HTML_NAMESPACE ? name.toLowerCase() : name;
  }

  getAttribute(name: string): string | null {
    name = this.$name(name);
    if (name === "style") return this.$style?.length ? this.$style.cssText : null;
    const value = this.$attrs.get(name);
    return value === undefined ? null : String(value);
  }

  /**
   * Unlike the DOM, the raw value is kept (not stringified) so mini program
   * components receive arrays, objects, numbers and booleans as is.
   */
  setAttribute(name: string, value: unknown): void {
    name = this.$name(name);
    if (name === "style") {
      this.style.cssText = String(value);
      return;
    }
    if (this.$attrs.get(name) === value && this.$attrs.has(name)) return;
    this.$attrs.set(name, value);
    this.$attrChanged(name);
  }

  removeAttribute(name: string): void {
    name = this.$name(name);
    if (name === "style") {
      if (this.$style?.length) this.$style.cssText = "";
      return;
    }
    if (this.$attrs.delete(name)) this.$attrChanged(name);
  }

  hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }

  toggleAttribute(name: string, force?: boolean): boolean {
    const add = force ?? !this.hasAttribute(name);
    if (add) {
      if (!this.hasAttribute(name)) this.setAttribute(name, "");
    } else this.removeAttribute(name);
    return add;
  }

  getAttributeNames(): string[] {
    return this.attributes.map((attr) => attr.name);
  }

  hasAttributes(): boolean {
    return this.attributes.length > 0;
  }

  get attributes(): Attr[] {
    const list: Attr[] = [];
    for (const [name, value] of this.$attrs)
      list.push({ name, localName: name, value: String(value) });
    if (this.$style?.length)
      list.push({ name: "style", localName: "style", value: this.$style.cssText });
    return list;
  }

  /** @internal */
  $attrChanged(name: string): void {
    if (name === "id") enqueueField(this, "uid");
    else if (name === "class") enqueueField(this, "cl");
    else {
      const key = attrKey(name);
      if (key === "catchmove") this.$refreshNodeName();
      else if (defaultsOf(this.$component).has(key)) enqueueField(this, key);
    }
  }

  // Reflected properties

  get id(): string {
    return this.getAttribute("id") ?? "";
  }

  set id(value: string) {
    this.setAttribute("id", value);
  }

  get className(): string {
    return this.getAttribute("class") ?? "";
  }

  set className(value: string) {
    this.setAttribute("class", value);
  }

  get classList(): DOMTokenList {
    return (this.$classList ??= new DOMTokenList(this));
  }

  get style(): CSSStyleDeclaration {
    return (this.$style ??= createStyle(this));
  }

  set style(value: string) {
    this.style.cssText = value;
  }

  /**
   * Reflects the `type` attribute. On `<input>` it is the HTML input type,
   * `"text"` when missing or not an HTML one (like mini program `digit` or
   * `nickname`), as in browsers: React only handles `onChange` of inputs
   * whose `type` it knows.
   */
  get type(): string {
    const type = this.getAttribute("type")?.toLowerCase() ?? "";
    if (this.localName !== "input") return type;
    return HTML_INPUT_TYPES.has(type) ? type : "text";
  }

  set type(value: string) {
    this.setAttribute("type", value);
  }

  get dataset(): Record<string, string | undefined> {
    const toAttr = (key: string) => `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    return new Proxy({} as Record<string, string | undefined>, {
      get: (_, key) =>
        typeof key === "string" ? (this.getAttribute(toAttr(key)) ?? undefined) : undefined,
      set: (_, key, value) => {
        if (typeof key === "string") this.setAttribute(toAttr(key), String(value));
        return true;
      },
      deleteProperty: (_, key) => {
        if (typeof key === "string") this.removeAttribute(toAttr(key));
        return true;
      },
      has: (_, key) => typeof key === "string" && this.hasAttribute(toAttr(key)),
      ownKeys: () =>
        this.getAttributeNames()
          .filter((name) => name.startsWith("data-"))
          .map((name) => name.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())),
      getOwnPropertyDescriptor: (_, key) =>
        typeof key === "string" && this.hasAttribute(toAttr(key))
          ? { enumerable: true, configurable: true, value: this.getAttribute(toAttr(key)) }
          : undefined,
    });
  }

  /**
   * Form value. Kept raw like attributes: `picker`/`picker-view` values are
   * numbers or arrays. Updated from `input`/`change` events of the component.
   */
  get value(): unknown {
    return this.$attrs.get("value") ?? "";
  }

  set value(value: unknown) {
    this.setAttribute("value", value ?? "");
  }

  get checked(): boolean {
    return coerce(false, this.$attrs.get("checked")) === true;
  }

  set checked(value: boolean) {
    this.setAttribute("checked", !!value);
  }

  get content(): DocumentFragment | null {
    if (this.localName !== "template") return null;
    return (this.$content ??= this.$doc().createDocumentFragment());
  }

  // Tree

  get children(): Element[] {
    return this.childNodes.filter((node): node is Element => node.nodeType === ELEMENT_NODE);
  }

  get childElementCount(): number {
    return this.children.length;
  }

  get firstElementChild(): Element | null {
    return this.children[0] ?? null;
  }

  get lastElementChild(): Element | null {
    const children = this.children;
    return children[children.length - 1] ?? null;
  }

  get nextElementSibling(): Element | null {
    const siblings = this.parentNode?.childNodes ?? [];
    for (let i = siblings.indexOf(this) + 1; i > 0 && i < siblings.length; i++) {
      if (siblings[i].nodeType === ELEMENT_NODE) return siblings[i] as Element;
    }
    return null;
  }

  get previousElementSibling(): Element | null {
    const siblings = this.parentNode?.childNodes ?? [];
    for (let i = siblings.indexOf(this) - 1; i >= 0; i--) {
      if (siblings[i].nodeType === ELEMENT_NODE) return siblings[i] as Element;
    }
    return null;
  }

  get innerHTML(): string {
    return serializeChildren(this);
  }

  set innerHTML(html: string) {
    const target = this.content ?? this;
    target.replaceChildren();
    if (html) parseHTML(String(html), this.$doc(), this);
  }

  get outerHTML(): string {
    return serialize(this);
  }

  insertAdjacentHTML(position: string, html: string): void {
    const fragment = this.$doc().createDocumentFragment();
    parseHTML(html, this.$doc(), fragment);
    this.$insertAdjacent(position, fragment);
  }

  insertAdjacentElement(position: string, element: Element): Element {
    this.$insertAdjacent(position, element);
    return element;
  }

  insertAdjacentText(position: string, text: string): void {
    this.$insertAdjacent(position, this.$doc().createTextNode(text));
  }

  private $insertAdjacent(position: string, node: Node): void {
    switch (position.toLowerCase()) {
      case "beforebegin":
        this.parentNode?.insertBefore(node, this);
        break;
      case "afterbegin":
        this.insertBefore(node, this.firstChild);
        break;
      case "beforeend":
        this.appendChild(node);
        break;
      case "afterend":
        this.parentNode?.insertBefore(node, this.nextSibling);
        break;
      default:
        throw new SyntaxError(`Invalid position: ${position}`);
    }
  }

  matches(selector: string): boolean {
    return matches(this, selector);
  }

  closest(selector: string): Element | null {
    for (let el: Element | null = this; el; el = el.parentElement) {
      if (matches(el, selector)) return el;
    }
    return null;
  }

  querySelector(selector: string): Element | null {
    return querySelectorAll(this, selector, true)[0] ?? null;
  }

  querySelectorAll(selector: string): Element[] {
    return querySelectorAll(this, selector, false);
  }

  getElementsByTagName(name: string): Element[] {
    return querySelectorAll(this, name === "*" ? "*" : name.toLowerCase(), false);
  }

  getElementsByClassName(names: string): Element[] {
    const selector = names
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((name) => `.${name}`)
      .join("");
    return selector ? querySelectorAll(this, selector, false) : [];
  }

  // Interaction

  /** Focuses `input`/`textarea` through their `focus` attribute. */
  focus(): void {
    if (defaultsOf(this.$component).has("focus")) this.setAttribute("focus", true);
  }

  blur(): void {
    if (defaultsOf(this.$component).has("focus")) this.setAttribute("focus", false);
  }

  click(): void {
    this.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
  }

  // Serialization

  /** @internal Re-send the template name if it changed. */
  $refreshNodeName(): void {
    if (this.$component === "view" && this.$connected && this.$nodeName() !== this.$nn) {
      enqueueField(this, "nn");
    }
  }

  override $refreshBindings(): void {
    this.$refreshNodeName();
    super.$refreshBindings();
  }

  /**
   * @internal Template name: the component, or a `view` variant.
   *
   * A native event only reaches the runtime through a node binding it, and
   * does not bubble out of the `comp` component rendering deep subtrees. So a
   * view binds the touch events listened to on it or on any ancestor, up to
   * the document and window where delegating frameworks (Solid, Svelte)
   * listen.
   */
  $nodeName(): string {
    const component = this.$component;
    if (component !== "view") return component;
    for (const name of this.$attrs.keys()) {
      if (attrKey(name) === "catchmove") return "catch-view";
    }
    let bound = viewEvents(this);
    let top: Node = this;
    for (let node = this.parentNode; node && bound !== ALL_VIEW_EVENTS; node = node.parentNode) {
      bound |= viewEvents(node);
      top = node;
    }
    if (top.nodeType === DOCUMENT_NODE) bound |= viewEvents((top as Document).defaultView);
    if (!bound) return "static-view";
    return bound === CLICK ? "click-view" : "view";
  }

  /** @internal */
  $class(): string {
    const cls = this.$attrs.get("class");
    const base = HTML_TAGS.has(this.localName) ? `h5-${this.localName}` : "";
    if (cls == null || cls === "") return base;
    return base ? `${base} ${cls}` : String(cls);
  }

  $field(key: string): unknown {
    switch (key) {
      case "nn":
        return (this.$nn = this.$nodeName());
      case "uid":
        return this.id || this.sid;
      case "cl":
        return this.$class();
      case "st":
        return this.$style?.cssText ?? "";
    }
    const defaults = defaultsOf(this.$component);
    for (const [name, value] of this.$attrs) {
      if (attrKey(name) === key) return coerce(defaults.get(key)!, value);
    }
    return null;
  }

  $serialize(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      nn: (this.$nn = this.$nodeName()),
      sid: this.sid,
      uid: this.id || this.sid,
    };
    const cls = this.$class();
    if (cls) data.cl = cls;
    const style = this.$style?.cssText;
    if (style) data.st = style;
    const defaults = defaultsOf(this.$component);
    for (const [name, value] of this.$attrs) {
      const key = attrKey(name);
      const defaultValue = defaults.get(key);
      if (defaultValue !== undefined) data[key] = coerce(defaultValue, value);
    }
    if (COMPONENTS[this.$component].children && this.childNodes.length) {
      data.cn = this.childNodes.map((child) => child.$serialize());
    }
    return data;
  }

  $clone(): Element {
    const doc = this.$doc();
    const clone = doc.createElementNS(this.namespaceURI, this.localName);
    for (const [name, value] of this.$attrs) clone.$attrs.set(name, value);
    if (this.$style?.length) clone.style.cssText = this.$style.cssText;
    if (this.$content) clone.content!.appendChild(this.$content.cloneNode(true));
    return clone;
  }
}

defineEventHandlers(Element.prototype, GLOBAL_EVENT_HANDLERS);

const hasInstance = Function.prototype[Symbol.hasInstance];

/**
 * Every element is an {@link Element}. `instanceof` the interfaces below
 * checks namespace and tag instead, like the distinct DOM interfaces:
 * frameworks branch on them (Vue renders everything as SVG into a container
 * that is an `SVGElement`). Subclasses (custom elements) keep the prototype
 * chain check.
 */
export class HTMLElement extends Element {
  static [Symbol.hasInstance](value: unknown): boolean {
    if (this !== HTMLElement) return hasInstance.call(this, value);
    return value instanceof Element && value.namespaceURI === HTML_NAMESPACE;
  }
}

export class SVGElement extends Element {
  static [Symbol.hasInstance](value: unknown): boolean {
    if (this !== SVGElement) return hasInstance.call(this, value);
    return value instanceof Element && value.namespaceURI === SVG_NAMESPACE;
  }
}

/** `<video>` and `<audio>`. */
export class HTMLMediaElement extends HTMLElement {
  static [Symbol.hasInstance](value: unknown): boolean {
    if (this !== HTMLMediaElement) return hasInstance.call(this, value);
    return (
      value instanceof HTMLElement && (value.localName === "video" || value.localName === "audio")
    );
  }
}

/** `<iframe>`. Never created by mini programs; React checks for it when restoring focus. */
export class HTMLIFrameElement extends HTMLElement {
  static [Symbol.hasInstance](value: unknown): boolean {
    if (this !== HTMLIFrameElement) return hasInstance.call(this, value);
    return value instanceof HTMLElement && value.localName === "iframe";
  }
}
