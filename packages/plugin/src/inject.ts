/**
 * `inject` for bundlers without one of their own: imports `GLOBALS` from
 * `GLOBALS_ID` in modules referencing them as free variables.
 */
import { GLOBALS, INJECT } from "./core";

export type Lang = "js" | "jsx" | "ts" | "tsx";

/** JavaScript or TypeScript module ids. */
export const SCRIPT = /^[^?#]*\.[cm]?[jt]sx?(?:[?#]|$)/;

const MENTIONS = new RegExp(`\\b(?:${GLOBALS.join("|")})\\b`);

/** Language of a JavaScript or TypeScript module, from its extension. */
export function langOf(id: string): Lang | null {
  const match = /\.[cm]?([jt]s)(x?)$/.exec(id.replace(/[?#].*/, ""));
  return match ? ((match[1] + match[2]) as Lang) : null;
}

/**
 * TypeScript is compiled to JavaScript (types are gone, so are imports only
 * used as types), JSX is preserved for the bundler.
 */
export async function inject(code: string, id: string, lang: Lang) {
  if (!MENTIONS.test(code)) return null;
  // Loaded on demand: most bundlers have an `inject` of their own.
  const { transformSync } = await import("oxc-transform");
  const result = transformSync(id, code, {
    lang,
    jsx: "preserve",
    inject: INJECT,
    sourcemap: true,
  });
  if (result.errors.length) {
    throw new Error(result.errors.map((error) => error.codeframe ?? error.message).join("\n"));
  }
  return { code: result.code, map: result.map };
}
