import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

import { COMPONENTS } from "./components";

/** `<tag` openings, or a whole string literal naming a tag (`"video"`, not `"image/png"`). */
const TAG = /<([a-z][a-z0-9-]*)(?=[\s/>])|(["'`])([a-z][a-z0-9-]*)\2/g;
const TOKENS = new Map<string, string[]>([
  ...Object.keys(COMPONENTS).map((name): [string, string[]] => [name, [name]]),
  ["img", ["image"]],
  ["checkbox", ["checkbox", "switch"]],
  ["range", ["slider"]],
]);

/**
 * A string literal that only names a tag: a `case "video":` label or an item
 * of a literal list (`["canvas", "video"]`), as in frameworks' tag tables.
 * Elements are created from a call argument (`createElement("video")`,
 * `jsx("video", …)`) or from markup, never from such a table.
 */
function isTagCheck(code: string, start: number, end: number): boolean {
  const before = code.slice(Math.max(0, start - 8), start);
  if (/\bcase\s*$/.test(before)) return true;
  return /[,[]\s*$/.test(before) && /^\s*[,\]]/.test(code.slice(end, end + 4));
}

export interface Scanner {
  scan(id: string, code: string): void;
  used(extra: string[]): Set<string>;
}

/** Source modules replace their previous contribution when transformed again. */
export function createScanner(root: string): Scanner {
  const modules = new Map<string, Set<string>>();
  let runtime: string | null | undefined;
  return {
    scan(id, code) {
      if (id.startsWith("\0")) return;
      if (runtime === undefined) {
        try {
          runtime = fs.realpathSync(
            path.dirname(
              createRequire(path.join(root, "package.json")).resolve(
                "@taro-next/runtime/package.json",
              ),
            ),
          );
        } catch {
          runtime = null;
        }
      }
      if (runtime && id.startsWith(runtime + path.sep)) return;
      const found = new Set<string>();
      for (const match of code.matchAll(TAG)) {
        if (match[1] === undefined && isTagCheck(code, match.index, match.index + match[0].length))
          continue;
        for (const component of TOKENS.get(match[1] ?? match[3]!) ?? []) found.add(component);
      }
      modules.set(id, found);
    },
    used(extra) {
      const result = new Set(["view", ...extra]);
      for (const found of modules.values()) {
        for (const component of found) result.add(component);
      }
      return result;
    },
  };
}
