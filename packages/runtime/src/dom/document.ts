import { connect } from "../update";
import { Comment, Text } from "./character-data";
import { Element, HTML_NAMESPACE } from "./element";
import { CustomEvent, Event } from "./event";
import { type EventTarget, GLOBAL_EVENT_HANDLERS, defineEventHandlers } from "./event-target";
import { DocumentFragment } from "./fragment";
import { DOCUMENT_NODE, Node } from "./node";
import { findById, querySelectorAll } from "./selector";

export class Document extends Node {
  readonly documentElement: Element;
  readonly head: Element;
  readonly body: Element;
  /** The window, set by the BOM. */
  defaultView: (EventTarget & { location?: unknown }) | null = null;
  readonly readyState = "complete";
  visibilityState: "visible" | "hidden" = "visible";
  /** @internal */ $title = "";

  constructor() {
    super(null);
    this.documentElement = this.createElement("html");
    this.head = this.createElement("head");
    this.body = this.createElement("body");
    this.documentElement.append(this.head, this.body);
    this.appendChild(this.documentElement);
    connect(this);
  }

  get nodeType(): number {
    return DOCUMENT_NODE;
  }

  get nodeName(): string {
    return "#document";
  }

  get hidden(): boolean {
    return this.visibilityState === "hidden";
  }

  get location(): unknown {
    return this.defaultView?.location ?? null;
  }

  get activeElement(): Element {
    return this.body;
  }

  /** Setting the title updates the navigation bar. */
  get title(): string {
    return this.$title;
  }

  set title(value: string) {
    this.$title = String(value);
    if (typeof wx !== "undefined") wx.setNavigationBarTitle({ title: this.$title });
  }

  createElement(tagName: string): Element {
    return new Element(this, String(tagName).toLowerCase(), HTML_NAMESPACE);
  }

  createElementNS(namespaceURI: string | null, qualifiedName: string): Element {
    const namespace = namespaceURI ?? HTML_NAMESPACE;
    const name = namespace === HTML_NAMESPACE ? qualifiedName.toLowerCase() : qualifiedName;
    return new Element(this, name, namespace);
  }

  createTextNode(data: string): Text {
    const text = new Text(this);
    text.$data = String(data);
    return text;
  }

  createComment(data: string): Comment {
    const comment = new Comment(this);
    comment.$data = String(data);
    return comment;
  }

  createDocumentFragment(): DocumentFragment {
    return new DocumentFragment(this);
  }

  createEvent(type: string): Event {
    return /^customevents?$/i.test(type) ? new CustomEvent("") : new Event("");
  }

  importNode<T extends Node>(node: T, deep = false): T {
    return node.cloneNode(deep) as T;
  }

  adoptNode<T extends Node>(node: T): T {
    node.parentNode?.removeChild(node);
    return node;
  }

  getElementById(id: string): Element | null {
    return findById(this, id);
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
    return this.documentElement.getElementsByClassName(names);
  }

  $clone(): Node {
    throw new Error("Cloning the document is not supported");
  }

  $serialize(): Record<string, unknown> {
    throw new Error("The document is never part of the rendered tree");
  }

  $field(): unknown {
    return undefined;
  }
}

defineEventHandlers(Document.prototype, [...GLOBAL_EVENT_HANDLERS, "visibilitychange"]);
