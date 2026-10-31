/**
 * webpack, rspack and rsbuild: one `app.js` chunk, the CSS assets the
 * user's CSS setup emits merged into `app.wxss`.
 */
import { APP_ID, APP_WXSS, type Core, type Hooks, INJECT, NAME, virtualModules } from "../core";

interface Source {
  source(): string | Buffer;
}

interface Compilation {
  hooks: {
    processAssets: {
      tap(
        options: { name: string; stage: number },
        fn: (assets: Record<string, Source>) => void,
      ): void;
    };
  };
  emitAsset(file: string, source: Source): void;
  deleteAsset(file: string): void;
}

interface PluginInstance {
  apply(compiler: Compiler): void;
}

/** What the adapter uses of webpack's and rspack's (compatible) compilers. */
interface Compiler {
  options: {
    context?: string;
    entry: unknown;
    devtool?: unknown;
    output: { filename?: unknown };
    optimization: { splitChunks?: unknown; runtimeChunk?: unknown };
  };
  webpack: {
    ProvidePlugin: new (definitions: Record<string, string | string[]>) => PluginInstance;
    optimize: {
      LimitChunkCountPlugin: new (options: { maxChunks: number }) => PluginInstance;
    };
    sources: { RawSource: new (source: string) => Source };
    Compilation: { PROCESS_ASSETS_STAGE_SUMMARIZE: number };
  };
  hooks: {
    thisCompilation: { tap(name: string, fn: (compilation: Compilation) => void): void };
  };
}

/** Globals, a single chunk and `app.wxss`, on top of the bundler's own configuration. */
function extend(core: Core, compiler: Compiler): void {
  const { webpack } = compiler;
  new webpack.ProvidePlugin(INJECT).apply(compiler);
  // `import()` included in the chunk.
  new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }).apply(compiler);
  compiler.hooks.thisCompilation.tap(NAME, (compilation) => {
    compilation.hooks.processAssets.tap(
      { name: NAME, stage: webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE },
      (assets) => {
        let css = "";
        for (const [file, asset] of Object.entries(assets)) {
          if (!file.endsWith(".css")) continue;
          css += asset.source().toString();
          compilation.deleteAsset(file);
        }
        compilation.emitAsset(APP_WXSS, new webpack.sources.RawSource(core.wxss(css)));
      },
    );
  });
}

export function webpackAdapter(core: Core, framework: "webpack" | "rspack"): Hooks {
  function apply(compiler: Compiler) {
    const { options } = compiler;
    core.root = options.context ?? process.cwd();
    options.entry = { app: { import: [APP_ID] } };
    options.output.filename = "[name].js";
    // webpack's development mode defaults to `eval` source maps, mini
    // programs have no `eval`.
    if (framework === "webpack") options.devtool ??= false;
    options.optimization.splitChunks = false;
    options.optimization.runtimeChunk = false;
    extend(core, compiler);
  }
  return {
    ...virtualModules(core),
    ...(framework === "webpack" ? { webpack: apply } : { rspack: apply }),
  };
}

export function rsbuildAdapter(core: Core): Hooks {
  return {
    ...virtualModules(core),
    rsbuild: {
      apply: "build",
      setup(api) {
        core.root = api.context.rootPath;
        api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) => {
          const merged = mergeRsbuildConfig(config, {
            output: {
              filename: { js: "[name].js", css: "[name].css" },
              distPath: { js: "", jsAsync: "", css: "", cssAsync: "" },
            },
            splitChunks: false,
          });
          // Replaced, not merged with the default entry.
          merged.source = { ...merged.source, entry: { app: { import: APP_ID, html: false } } };
          return merged;
        });
        api.modifyRspackConfig((config) => {
          config.plugins.push({ apply: (compiler: Compiler) => extend(core, compiler) });
        });
      },
    },
  };
}
