import { CLEAN, connect, disconnect, enqueueInsert, enqueueRemove } from "../update";
import type { Document } from "./document";
import type { Element } from "./element";
import { EventTarget } from "./event-target";

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const COMMENT_NODE = 8;
export const DOCUMENT_NODE = 9;
export const DOCUMENT_FRAGMENT_NODE = 11;

let sidCounter = 0;

export abstract class Node extends EventTarget {
  static readonly ELEMENT_NODE = ELEMENT_NODE;
  static readonly TEXT_NODE = TEXT_NODE;
  static readonly COMMENT_NODE = COMMENT_NODE;
  static readonly DOCUMENT_NODE = DOCUMENT_NODE;
  static readonly DOCUMENT_FRAGMENT_NODE = DOCUMENT_FRAGMENT_NODE;

  abstract readonly nodeType: number;
  abstract readonly nodeName: string;

  parentNode: Node | null = null;
  readonly childNodes: Node[] = [];
  /** Runtime id: `data-sid` in WXML and the `wx:key` of the node. */
  readonly sid = `_${(++sidCounter).toString(36)}`;

  /** @internal */ $ownerDocument: Document | null;
  /** @internal Attached to the document. */ $connected = false;
  /** @internal Pending child list update, see `update.ts`. */ $cn = CLEAN;
  /** @internal Pending field updates, see `update.ts`. */ $fields: Set<string> | null = null;

  constructor(ownerDocument: Document | null) {
    super();
    this.$ownerDocument = ownerDocument;
  }

  get ownerDocument(): Document | null {
    return this.$ownerDocument;
  }

  get isConnected(): boolean {
    return this.$connected;
  }

  get parentElement(): Element | null {
    const parent = this.parentNode;
    return parent && parent.nodeType === ELEMENT_NODE ? (parent as Element) : null;
  }

  get firstChild(): Node | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): Node | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get nextSibling(): Node | null {
    const siblings = this.parentNode?.childNodes;
    return siblings ? (siblings[siblings.indexOf(this) + 1] ?? null) : null;
  }

  get previousSibling(): Node | null {
    const siblings = this.parentNode?.childNodes;
    return siblings ? (siblings[siblings.indexOf(this) - 1] ?? null) : null;
  }

  get nodeValue(): string | null {
    return null;
  }

  set nodeValue(_value: string | null) {}

  get textContent(): string | null {
    let text = "";
    for (const child of this.childNodes) {
      if (child.nodeType !== COMMENT_NODE) text += child.textContent ?? "";
    }
    return text;
  }

  set textContent(value: string | null) {
    this.replaceChildren();
    const text = value == null ? "" : String(value);
    if (text) this.appendChild(this.$doc().createTextNode(text));
  }

  hasChildNodes(): boolean {
    return this.childNodes.length > 0;
  }

  contains(other: Node | null): boolean {
    for (let node = other; node; node = node.parentNode) {
      if (node === this) return true;
    }
    return false;
  }

  getRootNode(): Node {
    let node: Node = this;
    while (node.parentNode) node = node.parentNode;
    return node;
  }

  appendChild<T extends Node>(node: T): T {
    return this.insertBefore(node, null);
  }

  insertBefore<T extends Node>(node: T, ref: Node | null): T {
    if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
      for (const child of node.childNodes.slice()) this.insertBefore(child, ref);
      return node;
    }
    if (ref === node) ref = node.nextSibling;
    if (ref && ref.parentNode !== this) {
      throw new Error("NotFoundError: the reference node is not a child of this node");
    }
    if (node.contains(this)) {
      throw new Error("HierarchyRequestError: the new child is an ancestor of the parent");
    }
    node.parentNode?.removeChild(node);
    const children = this.childNodes;
    const index = ref ? children.indexOf(ref) : children.length;
    children.splice(index, 0, node);
    node.parentNode = this;
    if (this.$connected) {
      connect(node);
      enqueueInsert(this, index);
    }
    return node;
  }

  removeChild<T extends Node>(node: T): T {
    const index = this.childNodes.indexOf(node);
    if (index < 0) throw new Error("NotFoundError: the node is not a child of this node");
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    if (this.$connected) {
      disconnect(node);
      enqueueRemove(this, index);
    }
    return node;
  }

  replaceChild<T extends Node>(node: Node, old: T): T {
    if (node !== old) {
      this.insertBefore(node, old);
      this.removeChild(old);
    }
    return old;
  }

  cloneNode(deep = false): Node {
    const clone = this.$clone();
    if (deep) {
      for (const child of this.childNodes) clone.appendChild(child.cloneNode(true));
    }
    return clone;
  }

  // ChildNode / ParentNode mixins

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  before(...nodes: Array<Node | string>): void {
    const parent = this.parentNode;
    if (!parent) return;
    for (const node of nodes) parent.insertBefore(this.$toNode(node), this);
  }

  after(...nodes: Array<Node | string>): void {
    const parent = this.parentNode;
    if (!parent) return;
    const next = this.nextSibling;
    for (const node of nodes) parent.insertBefore(this.$toNode(node), next);
  }

  replaceWith(...nodes: Array<Node | string>): void {
    const parent = this.parentNode;
    if (!parent) return;
    const next = this.nextSibling;
    parent.removeChild(this);
    for (const node of nodes) parent.insertBefore(this.$toNode(node), next);
  }

  append(...nodes: Array<Node | string>): void {
    for (const node of nodes) this.appendChild(this.$toNode(node));
  }

  prepend(...nodes: Array<Node | string>): void {
    const first = this.firstChild;
    for (const node of nodes) this.insertBefore(this.$toNode(node), first);
  }

  replaceChildren(...nodes: Array<Node | string>): void {
    while (this.childNodes.length) this.removeChild(this.childNodes[this.childNodes.length - 1]);
    this.append(...nodes);
  }

  override $eventPath(): EventTarget[] {
    const path: EventTarget[] = [];
    let node: Node | null = this;
    let top: Node = this;
    for (; node; node = node.parentNode) {
      path.push(node);
      top = node;
    }
    if (top.nodeType === DOCUMENT_NODE) {
      const view = (top as Document).defaultView;
      if (view) path.push(view);
    }
    return path;
  }

  /** @internal Shallow copy. */
  abstract $clone(): Node;

  /** @internal Serialized form, see `components.ts`. */
  abstract $serialize(): Record<string, unknown>;

  /** @internal Current value of a serialized field. */
  abstract $field(key: string): unknown;

  /** @internal Document creating new nodes for this one (a document is its own). */
  $doc(): Document {
    return this.$ownerDocument ?? (this as unknown as Document);
  }

  private $toNode(node: Node | string): Node {
    return typeof node === "string" ? this.$doc().createTextNode(node) : node;
  }
}
