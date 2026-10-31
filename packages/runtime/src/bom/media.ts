import { Event } from "../dom/event";
import { EventTarget } from "../dom/event-target";
import { appBaseInfo, windowInfo } from "./system";

/** Evaluates a media query against the window size and the system theme. */
function evaluateMedia(query: string): boolean {
  const info = windowInfo();
  const width = info.windowWidth ?? 0;
  const height = info.windowHeight ?? 0;
  return query.split(",").some((part) =>
    part
      .trim()
      .toLowerCase()
      .split(/\s+and\s+/)
      .every((condition) => {
        let negate = false;
        let c = condition.trim();
        if (c.startsWith("not ")) {
          negate = true;
          c = c.slice(4).trim();
        }
        c = c.replace(/^only\s+/, "");
        let result: boolean;
        const feature = /^\(\s*([a-z-]+)\s*(?::\s*([^)]+?))?\s*\)$/.exec(c);
        if (!feature) {
          result = c === "all" || c === "screen";
        } else {
          const [, name, value = ""] = feature;
          const px = parseFloat(value);
          switch (name) {
            case "min-width":
              result = width >= px;
              break;
            case "max-width":
              result = width <= px;
              break;
            case "min-height":
              result = height >= px;
              break;
            case "max-height":
              result = height <= px;
              break;
            case "orientation":
              result = (width > height ? "landscape" : "portrait") === value;
              break;
            case "prefers-color-scheme":
              result = (appBaseInfo().theme ?? "light") === value;
              break;
            case "prefers-reduced-motion":
              result = value === "no-preference";
              break;
            case "hover":
            case "any-hover":
              result = value === "none";
              break;
            case "pointer":
            case "any-pointer":
              result = value === "coarse";
              break;
            default:
              result = false;
          }
        }
        return negate ? !result : result;
      }),
  );
}

export class MediaQueryList extends EventTarget {
  readonly media: string;
  onchange: ((event: Event) => void) | null = null;
  /** @internal */ $matches: boolean;

  constructor(media: string) {
    super();
    this.media = media;
    this.$matches = evaluateMedia(media);
  }

  get matches(): boolean {
    return this.$matches;
  }

  addListener(listener: (event: Event) => void): void {
    this.addEventListener("change", listener);
  }

  removeListener(listener: (event: Event) => void): void {
    this.removeEventListener("change", listener);
  }

  /** @internal Re-evaluate and fire `change` when the result flipped. */
  $update(): void {
    const matches = evaluateMedia(this.media);
    if (matches === this.$matches) return;
    this.$matches = matches;
    const event = Object.assign(new Event("change"), { matches, media: this.media });
    this.onchange?.(event);
    this.dispatchEvent(event);
  }
}

const mediaQueries = new Set<MediaQueryList>();

export function matchMedia(query: string): MediaQueryList {
  const list = new MediaQueryList(query);
  mediaQueries.add(list);
  return list;
}

export function updateMediaQueries(): void {
  for (const list of mediaQueries) list.$update();
}
