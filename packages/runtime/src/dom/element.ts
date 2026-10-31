import { HOVER_KEYS, HTML_TAGS, attrKey, componentOf, kindsOf } from "../components";
import { config } from "../config";
import { enqueueField, enqueueReplace } from "../update";
import { DOMTokenList } from "./class-list";
import { Event } from "./event";
import { GLOBAL_EVENT_HANDLERS, defineEventHandlers } from "./event-target";
import type { DocumentFragment } from "./fragment";
import { SVG_NAMESPACE, serialize, serializeChildren, parseHTML } from "./html";
import { mutationHook } from "./mutation-hook";
import { ELEMENT_NODE, Node } from "./node";
import { matches, querySelectorAll } from "./selector";
import { type CSSStyleDeclaration, createStyle, pxToRpx } from "./style";
import { CLICK, parentEvents, viewEvents } from "./view-events";

export const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

export interface Attr {
  readonly name: string;
  readonly localName: string;
  readonly value: string;
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
function coerce(kind: "b" | "n" | "s" | "r" | undefined, value: unknown): unknown {
  if (value == null) return null;
  switch (kind) {
    case "b":
      return value === "false" ? false : value === "" || !!value;
    case "n":
      return typeof value === "string" && value.trim() !== "" && Number.isFinite(+value)
        ? +value
        : value;
    case "s":
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
  $component: string;
  /** @internal Raw attribute values (`style` lives in {@link $style}). */
  $attrs = new Map<string, unknown>();
  /** @internal */ $style: CSSStyleDeclaration | null = null;
  /** @internal */ $classList: DOMTokenList | null = null;
  /** @internal */ $dataset: Record<string, string | undefined> | null = null;
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
    if (mutationHook) mutationHook({
      type: "attributes", target: this, attributeName: name, oldValue: this.getAttribute(name),
    });
    this.$attrs.set(name, value);
    this.$attrChanged(name);
  }

  removeAttribute(name: string): void {
    name = this.$name(name);
    if (name === "style") {
      if (this.$style?.length) this.$style.cssText = "";
      return;
    }
    if (!this.$attrs.has(name)) return;
    if (mutationHook) mutationHook({
      type: "attributes", target: this, attributeName: name, oldValue: this.getAttribute(name),
    });
    this.$attrs.delete(name);
    this.$attrChanged(name);
  }

  hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }

  setAttributeNS(_namespace: string | null, qualifiedName: string, value: unknown): void {
    if (qualifiedName === "style") {
      this.style.cssText = String(value);
      return;
    }
    if (this.$attrs.get(qualifiedName) === value && this.$attrs.has(qualifiedName)) return;
    if (mutationHook) mutationHook({
      type: "attributes", target: this, attributeName: qualifiedName,
      oldValue: this.$attrs.has(qualifiedName) ? String(this.$attrs.get(qualifiedName)) : null,
    });
    this.$attrs.set(qualifiedName, value);
    this.$attrChanged(qualifiedName);
  }

  /** @internal Resolve a local attribute name without HTML case folding. */
  $nameNS(localName: string): string | null {
    for (const name of this.$attrs.keys()) {
      if (name === localName || name.endsWith(`:${localName}`)) return name;
    }
    return localName === "style" && this.$style?.length ? "style" : null;
  }

  getAttributeNS(_namespace: string | null, localName: string): string | null {
    const name = this.$nameNS(localName);
    if (name === null) return null;
    return name === "style" ? this.$style!.cssText : String(this.$attrs.get(name));
  }

  removeAttributeNS(_namespace: string | null, localName: string): void {
    const name = this.$nameNS(localName);
    if (name === null) return;
    if (name === "style") {
      this.$style!.cssText = "";
      return;
    }
    if (mutationHook) mutationHook({
      type: "attributes", target: this, attributeName: name, oldValue: String(this.$attrs.get(name)),
    });
    this.$attrs.delete(name);
    this.$attrChanged(name);
  }

  hasAttributeNS(namespace: string | null, localName: string): boolean {
    return this.getAttributeNS(namespace, localName) !== null;
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
      list.push({ name, localName: name.slice(name.indexOf(":") + 1), value: String(value) });
    if (this.$style?.length)
      list.push({ name: "style", localName: "style", value: this.$style.cssText });
    return list;
  }

  /** @internal */
  $attrChanged(name: string): void {
    if (name === "type" && this.localName === "input") {
      const component = componentOf(this.localName, this.getAttribute("type"));
      if (component !== this.$component) {
        this.$component = component;
        enqueueReplace(this);
      }
      enqueueField(this, "password");
    }
    if (name === "id") enqueueField(this, "id");
    else if (name === "class") enqueueField(this, "cl");
    else {
      const key = attrKey(name);
      if (key === "catchmove" || HOVER_KEYS.has(key)) this.$refreshNodeName();
      if (kindsOf(this.$component).attrs.has(key)) enqueueField(this, key);
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
    if (this.$dataset) return this.$dataset;
    const toAttr = (key: string) => `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    return (this.$dataset = new Proxy({} as Record<string, string | undefined>, {
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
    }));
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
    return coerce("b", this.$attrs.get("checked")) === true;
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
    for (let node = this.$next; node; node = node.$next) {
      if (node.nodeType === ELEMENT_NODE) return node as Element;
    }
    return null;
  }

  get previousElementSibling(): Element | null {
    for (let node = this.$prev; node; node = node.$prev) {
      if (node.nodeType === ELEMENT_NODE) return node as Element;
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
    if (kindsOf(this.$component).attrs.has("focus")) this.setAttribute("focus", true);
  }

  blur(): void {
    if (kindsOf(this.$component).attrs.has("focus")) this.setAttribute("focus", false);
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

  override $refreshBindings(inherited: number): void {
    if (this.$component === "view" && this.$connected && this.$nodeName(inherited) !== this.$nn) {
      enqueueField(this, "nn");
    }
    super.$refreshBindings(inherited);
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
  $nodeName(inherited?: number): string {
    const component = this.$component;
    if (component !== "view") return component;
    let hover = false;
    for (const name of this.$attrs.keys()) {
      const key = attrKey(name);
      if (key === "catchmove") return "catch-view";
      if (HOVER_KEYS.has(key)) hover = true;
    }
    if (hover) return "view";
    const bound = (inherited ?? parentEvents(this)) | viewEvents(this);
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

  /** @internal HTML input attributes translated for the native input. */
  inputField(key: string): unknown {
    const type = this.getAttribute("type")?.toLowerCase() ?? "text";
    if (key === "password") {
      return this.$attrs.has("password")
        ? coerce("b", this.$attrs.get("password"))
        : type === "password";
    }
    if (type === "number") return "digit";
    return /^(text|idcard|digit|safe-password|nickname)$/.test(type) ? type : "text";
  }

  $field(key: string): unknown {
    switch (key) {
      case "nn":
        return (this.$nn = this.$nodeName());
      case "id":
        return this.id;
      case "cl":
        return this.$class();
      case "st": {
        const style = this.$style?.cssText ?? "";
        return config.designWidth > 0 ? pxToRpx(style, config.designWidth) : style;
      }
    }
    if (this.$component === "input" && (key === "type" || key === "password")) {
      return this.inputField(key);
    }
    const attrs = kindsOf(this.$component).attrs;
    for (const [name, value] of this.$attrs) {
      if (attrKey(name) === key) return coerce(attrs.get(key), value);
    }
    return null;
  }

  $serialize(inherited = parentEvents(this)): Record<string, unknown> {
    const data: Record<string, unknown> = {
      nn: (this.$nn = this.$nodeName(inherited)),
      sid: this.sid,
    };
    const id = this.id;
    if (id) data.id = id;
    const cls = this.$class();
    if (cls) data.cl = cls;
    const style = this.$style?.cssText;
    if (style) data.st = config.designWidth > 0 ? pxToRpx(style, config.designWidth) : style;
    const { attrs, leaf } = kindsOf(this.$component);
    const input = this.$component === "input";
    for (const [name, value] of this.$attrs) {
      const key = attrKey(name);
      if (input && (key === "type" || key === "password")) continue;
      const kind = attrs.get(key);
      if (kind !== undefined) data[key] = coerce(kind, value);
    }
    if (input) {
      if (this.$attrs.has("type")) data.type = this.inputField("type");
      const password = this.inputField("password");
      if (this.$attrs.has("password") || password) data.password = password;
    }
    if (!leaf && this.childNodes.length) {
      const mask = inherited | viewEvents(this);
      data.cn = this.childNodes.map((child) => child.$serialize(mask));
    }
    return data;
  }

  $clone(): Element {
    const doc = this.$doc();
    const clone = doc.createElementNS(this.namespaceURI, this.localName);
    for (const [name, value] of this.$attrs) clone.$attrs.set(name, value);
    clone.$component = componentOf(clone.localName, clone.getAttribute("type"));
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
