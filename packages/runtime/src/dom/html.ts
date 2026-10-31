/**
 * HTML fragment parser and serializer backing `innerHTML` / `outerHTML`.
 * Handles the markup frameworks generate for templates (Solid, Svelte, Vue
 * static hoisting): elements, attributes, void and raw-text elements, comments
 * (including `<!>`), and character references. It does not implement the
 * HTML5 error-recovery rules (implied end tags, foster parenting).
 */
import type { Document } from "./document";
import type { Element } from "./element";
import type { Node } from "./node";

const VOID_ELEMENTS: Record<string, true> = {
  area: true,
  base: true,
  br: true,
  col: true,
  embed: true,
  hr: true,
  img: true,
  input: true,
  link: true,
  meta: true,
  source: true,
  track: true,
  wbr: true,
};

const RAW_TEXT_ELEMENTS: Record<string, true> = {
  script: true,
  style: true,
  textarea: true,
  title: true,
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : +name.slice(1);
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[name] ?? entity;
  });
}

/** Parse `html` and append the resulting nodes to `parent`. */
export function parseHTML(html: string, document: Document, parent: Node): void {
  const stack: Node[] = [parent];
  const current = () => {
    const node = stack[stack.length - 1];
    return node.nodeName === "TEMPLATE" ? (node as Element).content! : node;
  };
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt !== i) {
      const end = lt < 0 ? html.length : lt;
      current().appendChild(document.createTextNode(decode(html.slice(i, end))));
      i = end;
      continue;
    }

    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      const close = end < 0 ? html.length : end;
      current().appendChild(document.createComment(html.slice(i + 4, close)));
      i = close + 3;
      continue;
    }

    if (html[i + 1] === "!" || html[i + 1] === "?") {
      // `<!>` (Svelte anchors), doctype and other bogus comments.
      const end = html.indexOf(">", i);
      const close = end < 0 ? html.length : end;
      const content = html.slice(i + 2, close);
      if (!/^doctype/i.test(content)) current().appendChild(document.createComment(content));
      i = close + 1;
      continue;
    }

    if (html[i + 1] === "/") {
      const end = html.indexOf(">", i);
      const name = html
        .slice(i + 2, end < 0 ? html.length : end)
        .trim()
        .toLowerCase();
      for (let depth = stack.length - 1; depth > 0; depth--) {
        if ((stack[depth] as Element).localName === name) {
          stack.length = depth;
          break;
        }
      }
      i = end < 0 ? html.length : end + 1;
      continue;
    }

    const tag = /^<([a-zA-Z][^\s/>]*)/.exec(html.slice(i));
    if (!tag) {
      current().appendChild(document.createTextNode("<"));
      i++;
      continue;
    }
    i += tag[0].length;
    // Find the end of the start tag, skipping `>` inside quoted values.
    let end = i;
    let quote = "";
    for (; end < html.length; end++) {
      const c = html[end];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    const inner = html.slice(i, end);
    i = end + 1;

    const parentElement = stack[stack.length - 1] as Element;
    const inSvg =
      tag[1].toLowerCase() === "svg" ||
      (parentElement.namespaceURI === SVG_NAMESPACE && parentElement.localName !== "foreignobject");
    const name = inSvg ? tag[1] : tag[1].toLowerCase();
    const element = inSvg
      ? document.createElementNS(SVG_NAMESPACE, name)
      : document.createElement(name);
    ATTRIBUTE.lastIndex = 0;
    for (let match; (match = ATTRIBUTE.exec(inner));) {
      const value = match[2] ?? match[3] ?? match[4] ?? "";
      element.setAttribute(match[1], decode(value));
    }
    current().appendChild(element);

    const selfClosing = /\/\s*$/.test(inner);
    if (VOID_ELEMENTS[name] || selfClosing) continue;
    if (RAW_TEXT_ELEMENTS[name]) {
      const close = html.toLowerCase().indexOf(`</${name}`, i);
      const textEnd = close < 0 ? html.length : close;
      const text = html.slice(i, textEnd);
      if (text)
        element.appendChild(document.createTextNode(name === "textarea" ? decode(text) : text));
      const after = close < 0 ? -1 : html.indexOf(">", close);
      i = after < 0 ? html.length : after + 1;
      continue;
    }
    stack.push(element);
  }
}

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function escape(text: string, attribute: boolean): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/\u00a0/g, "&nbsp;");
  return attribute
    ? escaped.replace(/"/g, "&quot;")
    : escaped.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Serialize the children of `node`. */
export function serializeChildren(node: Node): string {
  const target = node.nodeName === "TEMPLATE" ? (node as Element).content! : node;
  let html = "";
  for (const child of target.childNodes) html += serialize(child);
  return html;
}

/** Serialize `node` itself. */
export function serialize(node: Node): string {
  if (node.nodeType === 3) {
    const parent = node.parentNode as Element | null;
    const raw = parent && RAW_TEXT_ELEMENTS[parent.localName] && parent.localName !== "textarea";
    return raw ? (node.textContent ?? "") : escape(node.textContent ?? "", false);
  }
  if (node.nodeType === 8) return `<!--${node.textContent}-->`;
  if (node.nodeType !== 1) return serializeChildren(node);
  const element = node as Element;
  const name = element.localName;
  let html = `<${name}`;
  for (const attr of element.attributes) html += ` ${attr.name}="${escape(attr.value, true)}"`;
  html += ">";
  if (VOID_ELEMENTS[name]) return html;
  return `${html}${serializeChildren(element)}</${name}>`;
}
