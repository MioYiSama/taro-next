import type { Element } from "./element";
import { DOCUMENT_FRAGMENT_NODE, Node } from "./node";
import { findById, querySelectorAll } from "./selector";

export class DocumentFragment extends Node {
  get nodeType(): number {
    return DOCUMENT_FRAGMENT_NODE;
  }

  get nodeName(): string {
    return "#document-fragment";
  }

  get children(): Element[] {
    return this.childNodes.filter((node): node is Element => node.nodeType === 1);
  }

  get firstElementChild(): Element | null {
    return this.children[0] ?? null;
  }

  querySelector(selector: string): Element | null {
    return querySelectorAll(this, selector, true)[0] ?? null;
  }

  querySelectorAll(selector: string): Element[] {
    return querySelectorAll(this, selector, false);
  }

  getElementById(id: string): Element | null {
    return findById(this, id);
  }

  $clone(): DocumentFragment {
    return this.$doc().createDocumentFragment();
  }

  $serialize(): Record<string, unknown> {
    throw new Error("A DocumentFragment is never part of the rendered tree");
  }

  $field(): unknown {
    return undefined;
  }
}
