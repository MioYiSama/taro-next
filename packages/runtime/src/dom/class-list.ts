import type { Element } from "./element";

export class DOMTokenList {
  /** @internal */ $element: Element;

  constructor(element: Element) {
    this.$element = element;
  }

  /** @internal */
  $tokens(): string[] {
    return (this.$element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  }

  /** @internal */
  $write(tokens: string[]): void {
    this.$element.setAttribute("class", tokens.join(" "));
  }

  get length(): number {
    return this.$tokens().length;
  }

  get value(): string {
    return this.$element.getAttribute("class") ?? "";
  }

  set value(value: string) {
    this.$element.setAttribute("class", value);
  }

  item(index: number): string | null {
    return this.$tokens()[index] ?? null;
  }

  contains(token: string): boolean {
    return this.$tokens().includes(token);
  }

  add(...tokens: string[]): void {
    const list = this.$tokens();
    const missing = tokens.filter((token) => !list.includes(token));
    if (missing.length) this.$write([...list, ...missing]);
  }

  remove(...tokens: string[]): void {
    const list = this.$tokens();
    const kept = list.filter((token) => !tokens.includes(token));
    if (kept.length !== list.length) this.$write(kept);
  }

  toggle(token: string, force?: boolean): boolean {
    const has = this.contains(token);
    const add = force ?? !has;
    if (add && !has) this.add(token);
    else if (!add && has) this.remove(token);
    return add;
  }

  replace(token: string, replacement: string): boolean {
    const list = this.$tokens();
    const index = list.indexOf(token);
    if (index < 0) return false;
    list[index] = replacement;
    this.$write([...new Set(list)]);
    return true;
  }

  forEach(callback: (token: string, index: number, list: DOMTokenList) => void): void {
    this.$tokens().forEach((token, index) => callback(token, index, this));
  }

  [Symbol.iterator](): Iterator<string> {
    return this.$tokens()[Symbol.iterator]();
  }

  toString(): string {
    return this.value;
  }
}
