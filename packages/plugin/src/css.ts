import { HTML_TAGS, HTML_TO_COMPONENT } from "@taro-next/runtime/components";
import postcss, { type AtRule, type Node } from "postcss";
import selectorParser from "postcss-selector-parser";

/**
 * Same conversion as the runtime's inline style `pxToRpx`. A number directly
 * after a word character, `.` or an identifier hyphen (`fade-10px`) is not a
 * length; a leading `-` sign is kept.
 */
function pxToRpx(text: string, designWidth: number): string {
  return text.replace(
    /[uU][rR][lL]\((?:[^"'()\\]|\\.|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*\)|(?<![\w.]|[\w.-]-)(-?\d*\.?\d+)px(?![\w-])/g,
    (match, n) => {
      if (n === undefined) return match;
      const value = Number(((Number(n) * 750) / designWidth).toFixed(5));
      return value === 0 ? "0" : `${value}rpx`;
    },
  );
}

/** Turns bundled web CSS into selectors and units understood by the mini program. */
export function toWxss(css: string, designWidth: number): string {
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    for (let node: Node | undefined = rule.parent; node; node = node.parent) {
      if (node.type === "atrule" && /^(?:-\w+-)?keyframes$/i.test((node as AtRule).name)) return;
    }
    rule.selector = selectorParser((selectors) => {
      selectors.walkTags((tag) => {
        if (tag.value === "html") {
          tag.value = "page";
        } else if (HTML_TAGS.has(tag.value)) {
          tag.replaceWith(
            selectorParser.className({ value: `h5-${tag.value}`, spaces: tag.spaces }),
          );
        } else if (HTML_TO_COMPONENT[tag.value]) {
          tag.value = HTML_TO_COMPONENT[tag.value]!;
        }
      });
      selectors.walkPseudos((pseudo) => {
        if (pseudo.value === ":root") {
          pseudo.replaceWith(selectorParser.tag({ value: "page", spaces: pseudo.spaces }));
        }
      });
      selectors.walkUniversals((universal) => {
        universal.replaceWith(selectorParser.tag({ value: "view", spaces: universal.spaces }));
      });
    }).processSync(rule.selector);
  });
  if (designWidth > 0) {
    root.walkDecls((declaration) => {
      declaration.value = pxToRpx(declaration.value, designWidth);
    });
  }
  root.walkComments((comment) => {
    if (comment.text.trimStart().startsWith("# sourceMappingURL")) comment.remove();
  });
  return root.toString();
}
