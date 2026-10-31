import { SPECS, kindsOf } from "@taro-next/runtime/components";
import { describe, expect, test } from "vite-plus/test";

import { COMPONENTS, compactSpec } from "../src/components";
import { NAME, createCore } from "../src/core";
import { createScanner } from "../src/scan";
import { baseWxml, utilsWxs } from "../src/templates";

describe("component wire format", () => {
  test("the runtime and plugin have exactly the same component names", () => {
    expect(Object.keys(COMPONENTS).sort()).toEqual(Object.keys(SPECS).sort());
  });

  test.each(Object.keys(COMPONENTS))(
    "%s has matching attribute kinds and child support",
    (name) => {
      expect(compactSpec(COMPONENTS[name])).toBe(SPECS[name]);
      expect(kindsOf(name).leaf).toBe(!COMPONENTS[name].children);
    },
  );
});

describe("component scanning and templates", () => {
  test("scans native tags, HTML aliases and mapped input types", () => {
    const scanner = createScanner(process.cwd());
    scanner.scan(
      "/app.tsx",
      '<scroll-view/><img/><input type="checkbox"/><input type="range"/>"image/png" `text/css`',
    );
    expect([...scanner.used([])].sort()).toEqual([
      "checkbox",
      "image",
      "input",
      "scroll-view",
      "slider",
      "switch",
      "view",
    ]);
  });

  test("tag tables and case labels do not count as usage, created tags do", () => {
    const scanner = createScanner(process.cwd());
    scanner.scan(
      "/framework.js",
      'new Set(["canvas", "video"]);switch(t){case"swiper":}h("text",p);x = cond ? "button" : "label";',
    );
    expect([...scanner.used([])].sort()).toEqual(["button", "label", "text", "view"]);
  });

  test("a re-transform replaces a module's contribution and skips virtual modules", () => {
    const scanner = createScanner(process.cwd());
    scanner.scan("/app.js", 'createElement("swiper")');
    scanner.scan("/other.js", 'createElement("image")');
    scanner.scan("/app.js", 'createElement("scroll-view")');
    scanner.scan("\0virtual", 'createElement("video")');
    expect([...scanner.used(["slider"])].sort()).toEqual([
      "image",
      "scroll-view",
      "slider",
      "view",
    ]);
  });

  test("generates only used components, including their leaf utilities", () => {
    const core = createCore({ baseLevel: 2, components: ["icon"] });
    core.scan("/app.js", 'createElement("scroll-view")');
    const outputs = core.outputs("");
    expect(core.files()).not.toHaveProperty("base.wxml");
    expect(outputs["base.wxml"]).toContain("tmpl_0_scroll-view");
    expect(outputs["base.wxml"]).toContain("tmpl_icon");
    expect(outputs["base.wxml"]).not.toContain("tmpl_0_swiper");
    expect(outputs["utils.wxs"]).toContain('"icon":true');
    expect(outputs["utils.wxs"]).not.toContain('"input"');
    core.scan("/app.js", 'createElement("image")');
    expect(core.outputs("")["base.wxml"]).not.toContain("tmpl_0_scroll-view");
  });

  test("cheap view variants omit hover attributes and touch events use mut-bind", () => {
    const wxml = baseWxml(1, new Set(["view", "input"]));
    const template = (name: string) =>
      wxml.split(`<template name="${name}">`)[1].split("</template>")[0];
    expect(template("tmpl_0_static-view")).not.toContain("hover-class");
    expect(template("tmpl_0_click-view")).not.toContain("hover-class");
    expect(template("tmpl_0_click-view")).toContain('mut-bind:tap="eh"');
    expect(template("tmpl_0_view")).toContain("hover-class");
    expect(template("tmpl_0_view")).toContain('mut-bind:touchmove="eh"');
    expect(template("tmpl_0_catch-view")).toContain('catchtouchmove="eh"');
    expect(template("tmpl_input")).toContain('bindconfirm="eh"');
    expect(template("tmpl_input")).toContain('id="{{i.id}}"');
    expect(utilsWxs(new Set(["view"]))).not.toContain('"input"');
  });

  test("rejects unknown explicitly included components", () => {
    expect(() => createCore({ components: ["not-a-component"] })).toThrow(
      `${NAME}: unknown component "not-a-component"`,
    );
  });
});
