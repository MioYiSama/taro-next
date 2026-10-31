/**
 * Minimal CSS selector engine: type, `*`, `#id`, `.class`, attribute selectors
 * (`[a]`, `=`, `~=`, `|=`, `^=`, `$=`, `*=`), `:first-child`, `:last-child`,
 * `:only-child`, `:empty`, combinators (descendant, `>`, `+`, `~`) and lists.
 */
import type { Element } from "./element";

interface Compound {
  tag: string | null;
  id: string | null;
  classes: string[];
  attrs: Array<{ name: string; op: string; value: string }>;
  pseudos: string[];
}

/** Compounds and the combinators joining them, left to right. */
interface Complex {
  compounds: Compound[];
  combinators: string[];
}

const cache = new Map<string, Complex[]>();
const PSEUDOS: Record<string, true> = {
  "first-child": true,
  "last-child": true,
  "only-child": true,
  empty: true,
};
const IDENT = /^-?[_a-zA-Z\u00a0-\uffff][-\w\u00a0-\uffff]*|^\\./;

function parse(selector: string): Complex[] {
  const cached = cache.get(selector);
  if (cached) return cached;
  let i = 0;
  const s = selector;
  const fail = (): never => {
    throw new SyntaxError(`Unsupported selector: '${selector}'`);
  };
  const ident = (): string => {
    const match = IDENT.exec(s.slice(i));
    if (!match) fail();
    i += match![0].length;
    return match![0];
  };
  const spaces = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };

  const list: Complex[] = [];
  spaces();
  for (;;) {
    const complex: Complex = { compounds: [], combinators: [] };
    for (;;) {
      const compound: Compound = { tag: null, id: null, classes: [], attrs: [], pseudos: [] };
      if (s[i] === "*") {
        i++;
        compound.tag = "*";
      } else if (IDENT.test(s.slice(i))) {
        compound.tag = ident().toLowerCase();
      }
      for (;;) {
        const c = s[i];
        if (c === "#") {
          i++;
          compound.id = ident();
        } else if (c === ".") {
          i++;
          compound.classes.push(ident());
        } else if (c === "[") {
          i++;
          spaces();
          const name = ident().toLowerCase();
          spaces();
          let op = "";
          let value = "";
          const opMatch = /^[~|^$*]?=/.exec(s.slice(i));
          if (opMatch) {
            op = opMatch[0];
            i += op.length;
            spaces();
            const q = s[i];
            if (q === '"' || q === "'") {
              const end = s.indexOf(q, i + 1);
              if (end < 0) fail();
              value = s.slice(i + 1, end);
              i = end + 1;
            } else {
              value = ident();
            }
            spaces();
          }
          if (s[i] !== "]") fail();
          i++;
          compound.attrs.push({ name, op, value });
        } else if (c === ":") {
          i++;
          const pseudo = ident().toLowerCase();
          if (!PSEUDOS[pseudo]) fail();
          compound.pseudos.push(pseudo);
        } else break;
      }
      const empty =
        !compound.tag &&
        !compound.id &&
        !compound.classes.length &&
        !compound.attrs.length &&
        !compound.pseudos.length;
      if (empty) fail();
      complex.compounds.push(compound);

      const before = i;
      spaces();
      const c = s[i];
      if (c === ">" || c === "+" || c === "~") {
        i++;
        spaces();
        complex.combinators.push(c);
      } else if (i > before && i < s.length && c !== ",") {
        complex.combinators.push(" ");
      } else break;
    }
    list.push(complex);
    if (s[i] === ",") {
      i++;
      spaces();
      continue;
    }
    if (i < s.length) fail();
    break;
  }
  cache.set(selector, list);
  return list;
}

function matchesCompound(el: Element, c: Compound): boolean {
  if (c.tag && c.tag !== "*" && el.localName !== c.tag) return false;
  if (c.id !== null && el.id !== c.id) return false;
  if (c.classes.length) {
    const classes = el.className.split(/\s+/);
    if (!c.classes.every((name) => classes.includes(name))) return false;
  }
  for (const { name, op, value } of c.attrs) {
    const actual = el.getAttribute(name);
    if (actual === null) return false;
    if (
      (op === "=" && actual !== value) ||
      (op === "~=" && !actual.split(/\s+/).includes(value)) ||
      (op === "|=" && actual !== value && !actual.startsWith(`${value}-`)) ||
      (op === "^=" && !actual.startsWith(value)) ||
      (op === "$=" && !actual.endsWith(value)) ||
      (op === "*=" && !actual.includes(value))
    ) {
      return false;
    }
  }
  for (const pseudo of c.pseudos) {
    const siblings = el.parentNode
      ? el.parentNode.childNodes.filter((n) => n.nodeType === 1)
      : [el];
    if (
      (pseudo === "first-child" && siblings[0] !== el) ||
      (pseudo === "last-child" && siblings[siblings.length - 1] !== el) ||
      (pseudo === "only-child" && siblings.length !== 1) ||
      (pseudo === "empty" && el.childNodes.some((n) => n.nodeType === 1 || n.nodeType === 3))
    ) {
      return false;
    }
  }
  return true;
}

function matchesFrom(el: Element, complex: Complex, index: number): boolean {
  if (!matchesCompound(el, complex.compounds[index])) return false;
  if (index === 0) return true;
  const combinator = complex.combinators[index - 1];
  if (combinator === ">") {
    const parent = el.parentElement;
    return !!parent && matchesFrom(parent, complex, index - 1);
  }
  if (combinator === "+") {
    const prev = el.previousElementSibling;
    return !!prev && matchesFrom(prev, complex, index - 1);
  }
  if (combinator === "~") {
    for (let prev = el.previousElementSibling; prev; prev = prev.previousElementSibling) {
      if (matchesFrom(prev, complex, index - 1)) return true;
    }
    return false;
  }
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    if (matchesFrom(parent, complex, index - 1)) return true;
  }
  return false;
}

export function matches(el: Element, selector: string): boolean {
  return parse(selector).some((complex) => matchesFrom(el, complex, complex.compounds.length - 1));
}

/** Descendant elements of `root` matching `selector`, in document order. */
export function querySelectorAll(
  root: { childNodes: readonly unknown[] },
  selector: string,
  first: boolean,
): Element[] {
  const list = parse(selector);
  const result: Element[] = [];
  const walk = (node: { childNodes: readonly unknown[] }): boolean => {
    for (const child of node.childNodes as Element[]) {
      if (child.nodeType !== 1) continue;
      if (list.some((complex) => matchesFrom(child, complex, complex.compounds.length - 1))) {
        result.push(child);
        if (first) return true;
      }
      if (walk(child)) return true;
    }
    return false;
  };
  walk(root);
  return result;
}

/** First descendant element of `root` whose `id` is `id`. */
export function findById(root: { childNodes: readonly unknown[] }, id: string): Element | null {
  for (const child of root.childNodes as Element[]) {
    if (child.nodeType !== 1) continue;
    if (child.id === id) return child;
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}
