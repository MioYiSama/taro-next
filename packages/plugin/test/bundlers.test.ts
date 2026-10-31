/**
 * Builds the fixture app with every supported bundler and runs the output the
 * way the mini program does: each file wrapped in a function shadowing the
 * browser globals with `undefined`.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as url from "node:url";
import * as vm from "node:vm";

import { build as farmBuild } from "@farmfe/core";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { createRsbuild } from "@rsbuild/core";
import { rspack } from "@rspack/core";
import { build as esbuild } from "esbuild";
import { rolldown } from "rolldown";
import { rollup } from "rollup";
import css from "rollup-plugin-import-css";
import { build as viteBuild } from "vite-plus";
import { describe, expect, test } from "vite-plus/test";
import webpack from "webpack";

import type { Options } from "../src/index";
import taroEsbuild from "../src/plugins/esbuild";
import taroFarm from "../src/plugins/farm";
import taroRolldown from "../src/plugins/rolldown";
import taroRollup from "../src/plugins/rollup";
import taroRsbuild from "../src/plugins/rsbuild";
import taroRspack from "../src/plugins/rspack";
import taroVite from "../src/plugins/vite";
import taroWebpack from "../src/plugins/webpack";
import { BASE_WXSS } from "../src/templates";

const FIXTURE = url.fileURLToPath(new URL("fixture", import.meta.url));
const OPTIONS: Options = { entry: "src/index.js", projectConfig: { appid: "wx1234" } };
const plugin = (name: string) =>
  url.fileURLToPath(new URL(`../src/plugins/${name}.ts`, import.meta.url));

const hasBun = (() => {
  try {
    execFileSync("bun", ["--version"]);
    return true;
  } catch {
    return false;
  }
})();

const BUILDS: Record<string, (outDir: string) => Promise<void>> = {
  async vite(outDir) {
    await viteBuild({
      root: FIXTURE,
      configFile: false,
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
      plugins: [taroVite(OPTIONS)],
    });
  },
  async rolldown(outDir) {
    const bundle = await rolldown({
      cwd: FIXTURE,
      moduleTypes: { ".css": "js" },
      plugins: [css(), taroRolldown(OPTIONS)],
    });
    await bundle.write({ dir: outDir });
  },
  async rollup(outDir) {
    const cwd = process.cwd();
    process.chdir(FIXTURE);
    try {
      const bundle = await rollup({
        plugins: [nodeResolve(), commonjs(), css(), taroRollup(OPTIONS)],
      });
      await bundle.write({ dir: outDir });
    } finally {
      process.chdir(cwd);
    }
  },
  async webpack(outDir) {
    await compile(
      webpack({
        context: FIXTURE,
        // Defaults to `eval` source maps, which the plugin must turn off.
        mode: "development",
        output: { path: outDir },
        experiments: { css: true },
        module: { rules: [{ test: /\.css$/, type: "css/auto" }] },
        plugins: [taroWebpack(OPTIONS)],
      }),
    );
  },
  async rspack(outDir) {
    await compile(
      rspack({
        context: FIXTURE,
        mode: "production",
        output: { path: outDir },
        module: { rules: [{ test: /\.css$/, type: "css/auto" }] },
        plugins: [taroRspack(OPTIONS)],
      }),
    );
  },
  async rsbuild(outDir) {
    const rsbuild = await createRsbuild({
      cwd: FIXTURE,
      config: {
        logLevel: "silent",
        output: { distPath: { root: outDir } },
        plugins: [taroRsbuild(OPTIONS)],
      },
    });
    await rsbuild.build();
  },
  async esbuild(outDir) {
    await esbuild({
      absWorkingDir: FIXTURE,
      outdir: outDir,
      logLevel: "silent",
      plugins: [taroEsbuild(OPTIONS)],
    });
  },
  async farm(outDir) {
    await farmBuild({
      root: FIXTURE,
      clearScreen: false,
      compilation: { output: { path: outDir }, persistentCache: false },
      plugins: [taroFarm(OPTIONS)],
    });
  },
  async bun(outDir) {
    const script = `
      import taro from ${JSON.stringify(plugin("bun"))};
      const result = await Bun.build({ entrypoints: [], outdir: ${JSON.stringify(outDir)}, plugins: [taro(${JSON.stringify(OPTIONS)})] });
      if (!result.success) throw new AggregateError(result.logs, "build failed");
    `;
    execFileSync("bun", ["--eval", script], { cwd: FIXTURE, stdio: "pipe" });
  },
};

function compile(compiler: {
  run(
    callback: (error: Error | null, stats?: { hasErrors(): boolean; toString(): string }) => void,
  ): void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      if (error) reject(error);
      else if (stats?.hasErrors()) reject(new Error(stats.toString()));
      else resolve();
    });
  });
}

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"),
    )
    .sort();
}

/** Parameters the mini program wraps every file in. */
const WRAPPER = [
  "require",
  "module",
  "exports",
  "window",
  "document",
  "frames",
  "self",
  "location",
  "navigator",
  "localStorage",
  "history",
  "Caches",
  "screen",
  "alert",
  "confirm",
  "prompt",
  "XMLHttpRequest",
  "WebSocket",
  "Reporter",
  "webkit",
  "WeixinJSCore",
];

/** Apply `setData` paths (`root.cn[0].v`) the way the mini program view does. */
function applyPath(data: Record<string, unknown>, dataPath: string, value: unknown): void {
  const keys: Array<string | number> = [];
  dataPath.replace(/[^.[\]]+|\[(\d+)\]/g, (match, index?: string) => {
    keys.push(index === undefined ? match : Number(index));
    return match;
  });
  let target = data as Record<string | number, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    target[keys[i]] ??= typeof keys[i + 1] === "number" ? [] : {};
    target = target[keys[i]] as Record<string | number, unknown>;
  }
  target[keys[keys.length - 1]] = value;
}

/** Runs `app.js` and the page, returns the page data once rendered. */
async function run(dir: string): Promise<Record<string, unknown>> {
  type Config = Record<string, (...args: unknown[]) => unknown> & { data: object };
  let app: Config | undefined;
  let page: Config | undefined;
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    App: (config: Config) => (app = config),
    getApp: () => app,
    Page: (config: Config) => (page = config),
    Component: () => {},
  });
  for (const file of ["app.js", "pages/index/index.js"]) {
    const code = fs.readFileSync(path.join(dir, file), "utf8");
    const wrapped = vm.runInContext(`(function (${WRAPPER.join(", ")}) {${code}\n})`, context, {
      filename: file,
    }) as (...args: unknown[]) => void;
    const module = { exports: {} };
    wrapped(
      () => {
        throw new Error("require() is not expected");
      },
      module,
      module.exports,
    );
  }
  const data = structuredClone(page!.data) as Record<string, unknown>;
  page!.onLoad!.call(
    {
      data,
      setData(patch: Record<string, unknown>, callback?: () => void) {
        for (const [key, value] of Object.entries(patch))
          applyPath(data, key, structuredClone(value));
        callback?.();
      },
    },
    {},
  );
  // Rendering and `import()` settle in microtasks.
  await new Promise(setImmediate);
  return data;
}

describe.each(Object.keys(BUILDS))("%s", (name) => {
  test.skipIf(name === "bun" && !hasBun)("builds a mini program", { timeout: 60_000 }, async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `taro-next-${name}-`));
    const nodeEnv = process.env.NODE_ENV;
    // Bundlers without a mode option inherit NODE_ENV; don't compile Vitest's "test" mode.
    process.env.NODE_ENV = "production";
    try {
      await BUILDS[name]!(outDir);

      const files = listFiles(outDir).filter((file) => !file.endsWith(".map"));
      expect(files).toEqual([
        "app.js",
        "app.json",
        "app.wxss",
        "base.wxml",
        "comp/comp.js",
        "comp/comp.json",
        "comp/comp.wxml",
        "pages/index/index.js",
        "pages/index/index.json",
        "pages/index/index.wxml",
        "project.config.json",
        "utils.wxs",
      ]);

      const wxss = fs.readFileSync(path.join(outDir, "app.wxss"), "utf8");
      expect(wxss.startsWith(BASE_WXSS)).toBe(true);
      expect(wxss.slice(BASE_WXSS.length)).toMatch(/\.title\s*\{\s*color:\s*(red|#f00)/);
      expect(wxss).toMatch(/\.h5-div\s*\{\s*margin:\s*10rpx/);
      expect(wxss).toMatch(/page\s*\{\s*--gap:\s*4rpx/);
      expect(wxss).toMatch(/view\s*\{\s*box-sizing/);

      const wxml = fs.readFileSync(path.join(outDir, "base.wxml"), "utf8");
      expect(wxml).toContain("tmpl_0_scroll-view");
      expect(wxml).not.toContain("tmpl_0_swiper");

      const appJs = fs.readFileSync(path.join(outDir, "app.js"), "utf8");
      expect(appJs).not.toMatch(/\beval\(/);
      expect(appJs).not.toMatch(/process\.env\.NODE_ENV/);

      const rendered = JSON.stringify((await run(outDir)).root);
      expect(rendered).toContain("esm injected, cjs injected");
      expect(rendered).toContain("lazy inlined");
      expect(rendered).toMatch(/mode (production|development)/);
    } finally {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
