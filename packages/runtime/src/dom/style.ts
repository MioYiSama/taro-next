import { enqueueField } from "../update";
import type { Element } from "./element";
import { mutationHook } from "./mutation-hook";

/** Same length conversion and URL skipping as the plugin CSS pipeline. */
export function pxToRpx(text: string, designWidth: number): string {
  return text.replace(/[uU][rR][lL]\((?:[^"'()\\]|\\.|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*\)|(?<![\w.]|[\w.-]-)(-?\d*\.?\d+)px(?![\w-])/g, (match, n) => {
    if (n === undefined) return match;
    const value = Number((Number(n) * 750 / designWidth).toFixed(5));
    return value === 0 ? "0" : `${value}rpx`;
  });
}

/** `backgroundColor` → `background-color`, `WebkitTransform` → `-webkit-transform`. */
function hyphenate(name: string): string {
  if (name === "cssFloat") return "float";
  const kebab = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return kebab.startsWith("ms-") ? `-${kebab}` : kebab;
}

/** Split declarations on `;` outside of parentheses and quotes. */
function parseDeclarations(text: string): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  const push = (end: number) => {
    const declaration = text.slice(start, end);
    const colon = declaration.indexOf(":");
    if (colon > 0) {
      const name = declaration.slice(0, colon).trim();
      const value = declaration.slice(colon + 1).trim();
      if (name && value) result.push([name.startsWith("--") ? name : name.toLowerCase(), value]);
    }
    start = end + 1;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === ";" && depth === 0) push(i);
  }
  push(text.length);
  return result;
}

/** Inline style of an element, serialized to the `st` field. */
export class CSSStyleDeclaration {
  [property: string]: unknown;

  /** @internal */ $element: Element;
  /** @internal */ $properties = new Map<string, string>();

  constructor(element: Element) {
    this.$element = element;
  }

  get cssText(): string {
    let text = "";
    for (const [name, value] of this.$properties) text += `${name}: ${value};`;
    return text;
  }

  set cssText(text: string) {
    if (mutationHook) mutationHook({
      type: "attributes", target: this.$element, attributeName: "style",
      oldValue: this.length ? this.cssText : null,
    });
    this.$properties.clear();
    for (const [name, value] of parseDeclarations(text == null ? "" : String(text))) {
      this.$properties.set(name, value);
    }
    enqueueField(this.$element, "st");
  }

  get length(): number {
    return this.$properties.size;
  }

  item(index: number): string {
    return [...this.$properties.keys()][index] ?? "";
  }

  getPropertyValue(name: string): string {
    return this.$properties.get(name) ?? "";
  }

  getPropertyPriority(name: string): string {
    return this.getPropertyValue(name).endsWith("!important") ? "important" : "";
  }

  setProperty(name: string, value: unknown, priority = ""): void {
    if (value == null || value === "") {
      this.removeProperty(name);
      return;
    }
    let text = String(value).trim();
    if (priority === "important") text += " !important";
    if (this.$properties.get(name) === text) return;
    if (mutationHook) mutationHook({
      type: "attributes", target: this.$element, attributeName: "style",
      oldValue: this.length ? this.cssText : null,
    });
    this.$properties.set(name, text);
    enqueueField(this.$element, "st");
  }

  removeProperty(name: string): string {
    const old = this.getPropertyValue(name);
    if (!this.$properties.has(name)) return old;
    if (mutationHook) mutationHook({
      type: "attributes", target: this.$element, attributeName: "style", oldValue: this.cssText,
    });
    this.$properties.delete(name);
    enqueueField(this.$element, "st");
    return old;
  }
}

/** Style object supporting camelCase property access (`style.backgroundColor = 'red'`). */
export function createStyle(element: Element): CSSStyleDeclaration {
  return new Proxy(new CSSStyleDeclaration(element), {
    get(target, property, receiver) {
      if (typeof property === "string" && !(property in target)) {
        return target.getPropertyValue(hyphenate(property));
      }
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      if (typeof property === "string" && !(property in target)) {
        target.setProperty(hyphenate(property), value);
        return true;
      }
      return Reflect.set(target, property, value, receiver);
    },
  });
}
