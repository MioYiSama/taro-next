import { expect, test, vi } from "vite-plus/test";

import { configure, createAppConfig } from "../src/app";
import { Window } from "../src/bom/window";

test("configure rejects calls after the app config is created", () => {
  createAppConfig({ baseLevel: 16, designWidth: 750 });
  expect(() => configure({ app: {} })).toThrow(
    "configure() must be called while the app entry evaluates, before App() is registered",
  );
});

test("the launch query is available in location.search before the app entry renders", () => {
  vi.stubGlobal("wx", {
    getLaunchOptionsSync: () => ({ query: { ref: "launch", mode: "preview" } }),
  });
  try {
    const window = new Window();
    expect(window.location.search).toBe("?ref=launch&mode=preview");
    expect(window.history.length).toBe(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
