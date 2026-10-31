/**
 * Static mini program files: the recursive WXML templates rendering the
 * serialized DOM, the page and the `comp` component that continues rendering
 * past `baseLevel` nesting levels.
 */
import { attrKey, VIEW_VARIANTS } from "@taro-next/runtime/components";

import {
  type AttrDefault,
  COMMON_ATTRS,
  COMPONENTS,
  type ComponentSpec,
  TOUCH_EVENTS,
} from "./components";

export const PAGE = "pages/index/index";

/** WXML expression literal for a default value. */
function literal(value: Exclude<AttrDefault, null>): string {
  if (typeof value !== "string") return String(value);
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function attrBinding(name: string, value: AttrDefault): string {
  const key = attrKey(name);
  return value === null
    ? `${name}="{{i.${key}}}"`
    : `${name}="{{xs.b(i.${key},${literal(value)})}}"`;
}

/** Children loop rendering the next level, or `comp` once `baseLevel` is reached. */
function children(next: number, baseLevel: number): string {
  if (next >= baseLevel) return `<comp wx:for="{{i.cn}}" wx:key="sid" i="{{item}}"/>`;
  return `<block wx:for="{{i.cn}}" wx:key="sid"><template is="tmpl_${next}_container" data="{{i:item}}"/></block>`;
}

interface Variant {
  /** Template name suffix (`nn`). */
  name: string;
  /** WXML tag. */
  tag: string;
  spec: ComponentSpec;
  events: string[];
  catchMove?: boolean;
}

function variants(used: Set<string>): Variant[] {
  const list: Variant[] = [];
  for (const [tag, spec] of Object.entries(COMPONENTS)) {
    if (!used.has(tag)) continue;
    list.push({
      name: tag,
      tag,
      spec,
      events: [...(spec.touch ? TOUCH_EVENTS : []), ...spec.events],
    });
  }
  const view = COMPONENTS.view;
  if (used.has("view")) list.push(
    { name: VIEW_VARIANTS[0], tag: "view", spec: { ...view, attrs: COMMON_ATTRS }, events: [] },
    { name: VIEW_VARIANTS[1], tag: "view", spec: { ...view, attrs: COMMON_ATTRS }, events: ["tap"] },
    { name: VIEW_VARIANTS[2], tag: "view", spec: view, events: TOUCH_EVENTS, catchMove: true },
  );
  return list;
}

/** Childless components don't depend on the level, so they get a single `tmpl_<nn>` template. */
function template(variant: Variant, level: number | null, baseLevel: number): string {
  const attrs = [
    'id="{{i.id}}"',
    'data-sid="{{i.sid}}"',
    'class="{{i.cl}}"',
    'style="{{i.st}}"',
    ...Object.entries(variant.spec.attrs).map(([name, value]) => attrBinding(name, value)),
    ...variant.events.map((event) =>
      variant.catchMove && event === "touchmove"
        ? 'catchtouchmove="eh"'
        : TOUCH_EVENTS.includes(event) ? `mut-bind:${event}="eh"` : `bind${event}="eh"`,
    ),
  ];
  const name = level === null ? `tmpl_${variant.name}` : `tmpl_${level}_${variant.name}`;
  const body = level === null ? "" : children(level + 1, baseLevel);
  return `<template name="${name}"><${variant.tag} ${attrs.join(" ")}>${body}</${variant.tag}></template>`;
}

/** `base.wxml`: one template per component and nesting level. */
export function baseWxml(baseLevel: number, used: Set<string>): string {
  const list = variants(used);
  const lines = ['<wxs module="xs" src="./utils.wxs"/>'];
  for (const variant of list) {
    if (!variant.spec.children) lines.push(template(variant, null, baseLevel));
  }
  for (let level = 0; level < baseLevel; level++) {
    lines.push(
      `<template name="tmpl_${level}_container"><block wx:if="{{i.nn=='#text'}}">{{i.v}}</block><block wx:elif="{{i.nn!='#comment'}}"><template is="{{xs.t(${level},i.nn)}}" data="{{i:i}}"/></block></template>`,
    );
    for (const variant of list) {
      if (variant.spec.children) lines.push(template(variant, level, baseLevel));
    }
  }
  return `${lines.join("\n")}\n`;
}

/**
 * `utils.wxs`: `b` substitutes the component default for missing values, `t`
 * names the template rendering a node at a level.
 */
export function utilsWxs(used: Set<string>): string {
  const leaves = Object.keys(COMPONENTS).filter((name) => used.has(name) && !COMPONENTS[name].children);
  return `var leaves = ${JSON.stringify(Object.fromEntries(leaves.map((name) => [name, true])))};
module.exports = {
  b: function (value, fallback) {
    return value === undefined || value === null ? fallback : value;
  },
  t: function (level, nn) {
    return leaves[nn] ? "tmpl_" + nn : "tmpl_" + level + "_" + nn;
  },
};
`;
}

export const PAGE_JS = "Page(getApp().$createPage());\n";

export const PAGE_WXML = `<import src="../../base.wxml"/>
<block wx:if="{{root}}"><template is="tmpl_0_container" data="{{i:root}}"/></block>
`;

export const COMP_JS = "Component(getApp().$createComponent());\n";

export const COMP_JSON = `${JSON.stringify({ component: true, usingComponents: { comp: "./comp" } }, null, 2)}\n`;

// `i` is `{}` until the parent passes the node in.
export const COMP_WXML = `<import src="../base.wxml"/>
<block wx:if="{{i.sid}}"><template is="tmpl_0_container" data="{{i:i}}"/></block>
`;

const INLINE = [
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "cite",
  "code",
  "data",
  "dfn",
  "em",
  "i",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
  "del",
  "ins",
];

const h5 = (tags: string[]) => tags.map((tag) => `.h5-${tag}`).join(",");

/** Default styles of the HTML elements rendered as `view` (`h5-<tag>` classes). */
export const BASE_WXSS = `${h5(INLINE)}{display:inline}
${h5(["b", "strong", "th"])}{font-weight:bold}
${h5(["i", "em", "cite", "dfn", "var"])}{font-style:italic}
${h5(["u", "ins"])}{text-decoration:underline}
${h5(["s", "del"])}{text-decoration:line-through}
${h5(["code", "kbd", "samp", "pre"])}{font-family:monospace}
${h5(["sub"])}{vertical-align:sub;font-size:smaller}
${h5(["sup"])}{vertical-align:super;font-size:smaller}
${h5(["small"])}{font-size:smaller}
${h5(["mark"])}{background-color:yellow;color:black}
${h5(["a"])}{color:#0000ee;text-decoration:underline}
${h5(["p", "blockquote", "figure", "dl", "pre"])}{margin:1em 0}
${h5(["blockquote", "figure"])}{margin-left:40px;margin-right:40px}
${h5(["ul", "ol", "menu"])}{margin:1em 0;padding-left:40px}
${h5(["li"])}{display:list-item}
${h5(["ul", "menu"])}{list-style-type:disc}
${h5(["ol"])}{list-style-type:decimal}
${h5(["dd"])}{margin-left:40px}
${h5(["pre"])}{white-space:pre}
${h5(["hr"])}{border:0;border-top:1px solid #ccc;margin:0.5em 0}
${h5(["h1"])}{font-size:2em;margin:0.67em 0;font-weight:bold}
${h5(["h2"])}{font-size:1.5em;margin:0.83em 0;font-weight:bold}
${h5(["h3"])}{font-size:1.17em;margin:1em 0;font-weight:bold}
${h5(["h4"])}{margin:1.33em 0;font-weight:bold}
${h5(["h5"])}{font-size:0.83em;margin:1.67em 0;font-weight:bold}
${h5(["h6"])}{font-size:0.67em;margin:2.33em 0;font-weight:bold}
${h5(["table"])}{display:table;border-collapse:separate;border-spacing:2px}
${h5(["thead"])}{display:table-header-group}
${h5(["tbody"])}{display:table-row-group}
${h5(["tfoot"])}{display:table-footer-group}
${h5(["tr"])}{display:table-row}
${h5(["td", "th"])}{display:table-cell;padding:1px}
${h5(["caption"])}{display:table-caption;text-align:center}
`;
