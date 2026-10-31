import { describe, expect, test } from "vite-plus/test";

import { NAME, createCore } from "../src/core";
import { toWxss } from "../src/css";

describe("toWxss", () => {
  test("rewrites web selectors without changing classes, attributes or native tags", () => {
    expect(
      toWxss('html, :root, *, body, div > span, img, input, custom-tag, .div, [title="div"] {}', 0),
    ).toBe(
      'page, page, view, .h5-body, .h5-div > .h5-span, image, input, custom-tag, .div, [title="div"] {}',
    );
  });

  test("keeps keyframe selectors, including vendor-prefixed keyframes", () => {
    const css =
      "@keyframes pulse { from { opacity: 0 } to { opacity: 1 } } @-webkit-keyframes pulse { from { opacity: 0 } to { opacity: 1 } }";
    expect(toWxss(css, 750)).toBe(css);
  });

  test.each([
    ["10px", 750, "10rpx"],
    ["1.5px", 375, "3rpx"],
    ["0px", 750, "0"],
    ["375PX", 750, "375PX"],
    ["url(a-10px.png) 10px", 750, "url(a-10px.png) 10rpx"],
    ['url("a10px.png") 10px', 750, 'url("a10px.png") 10rpx'],
    ['url("a)10px.png") 10px', 750, 'url("a)10px.png") 10rpx'],
    ["URL(a-10px.png) 10px", 750, "URL(a-10px.png) 10rpx"],
    ["-1.5px .5px", 375, "-3rpx 1rpx"],
    ["fade-10px 2px", 750, "fade-10px 2rpx"],
    ["1px", 320, "2.34375rpx"],
    ["10px", 0, "10px"],
  ] as const)("converts %s at designWidth %s into %s", (value, designWidth, expected) => {
    expect(toWxss(`.box { width: ${value} }`, designWidth)).toBe(`.box { width: ${expected} }`);
  });

  test("converts custom property values but not media query parameters", () => {
    expect(toWxss("@media (max-width: 600px) { :root { --gap: 4px } }", 750)).toBe(
      "@media (max-width: 600px) { page { --gap: 4rpx } }",
    );
  });

  test("removes source map comments while retaining ordinary comments", () => {
    expect(toWxss("/* keep */ .box {} /*# sourceMappingURL=app.css.map */", 750)).toBe(
      "/* keep */ .box {}",
    );
  });
});

describe("pxtransform option", () => {
  test("defaults to 750 and passes the resolved options to the app", () => {
    const core = createCore({ baseLevel: 4 });
    expect(core.designWidth).toBe(750);
    expect(core.appModule()).toContain("App(createAppConfig({ baseLevel: 4, designWidth: 750 }));");
    expect(core.wxss("div { width: 10px }")).toContain(".h5-div { width: 10rpx }");
  });

  test("uses a configured design width", () => {
    const core = createCore({ pxtransform: { designWidth: 375 } });
    expect(core.designWidth).toBe(375);
    expect(core.appModule()).toContain("designWidth: 375");
    expect(core.wxss("div { width: 10px }")).toContain(".h5-div { width: 20rpx }");
  });

  test("false disables px conversion but still rewrites selectors", () => {
    const core = createCore({ pxtransform: false });
    expect(core.designWidth).toBe(0);
    expect(core.appModule()).toContain("designWidth: 0");
    expect(core.wxss("div { width: 10px }")).toContain(".h5-div { width: 10px }");
  });

  test.each([0, -1, NaN, Infinity, -Infinity])("rejects invalid designWidth %s", (designWidth) => {
    expect(() => createCore({ pxtransform: { designWidth } })).toThrow(
      `${NAME}: pxtransform.designWidth must be a positive number`,
    );
  });
});
