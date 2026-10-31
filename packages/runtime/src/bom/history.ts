/**
 * In-memory `History` and `Location` so client-side routers work inside the
 * single mini program page. Navigations never reload: assigning `location`
 * (or its `href`/`pathname`/`search`/`hash`) pushes an entry and fires
 * `popstate` (plus `hashchange` when the hash changed) for routers to react.
 */
import { HashChangeEvent, PopStateEvent } from "../dom/event";
import type { EventTarget } from "../dom/event-target";

export const ORIGIN = "http://localhost";

interface Entry {
  state: unknown;
  pathname: string;
  search: string;
  hash: string;
}

/** Split a path-ish string into pathname/search/hash. */
function split(rest: string): { path: string; search: string; hash: string } {
  const hashIndex = rest.indexOf("#");
  const hash = hashIndex < 0 ? "" : rest.slice(hashIndex);
  const beforeHash = hashIndex < 0 ? rest : rest.slice(0, hashIndex);
  const searchIndex = beforeHash.indexOf("?");
  const search = searchIndex < 0 ? "" : beforeHash.slice(searchIndex);
  const path = searchIndex < 0 ? beforeHash : beforeHash.slice(0, searchIndex);
  return { path, search: search === "?" ? "" : search, hash: hash === "#" ? "" : hash };
}

function normalize(pathname: string): string {
  const out: string[] = [];
  for (const segment of pathname.split("/").slice(1)) {
    if (segment === "..") out.pop();
    else if (segment !== ".") out.push(segment);
  }
  const last = pathname.split("/").pop();
  if ((last === "." || last === "..") && out[out.length - 1] !== "") out.push("");
  return `/${out.join("/")}`;
}

/** Resolve `url` against the current entry. Other origins resolve to their path. */
function resolve(url: string, base: Entry): Omit<Entry, "state"> {
  const absolute = /^(?:[a-z][a-z\d+.-]*:)?\/\/[^/?#]*(.*)$/i.exec(url);
  const { path, search, hash } = split(absolute ? absolute[1] || "/" : url);
  if (absolute || path.startsWith("/")) return { pathname: normalize(path), search, hash };
  if (path) {
    const directory = base.pathname.slice(0, base.pathname.lastIndexOf("/") + 1);
    return { pathname: normalize(directory + path), search, hash };
  }
  if (url.startsWith("?")) return { pathname: base.pathname, search, hash };
  return { pathname: base.pathname, search: base.search, hash: url ? hash : base.hash };
}

export class History {
  scrollRestoration: "auto" | "manual" = "auto";
  /** @internal */ $entries: Entry[] = [{ state: null, pathname: "/", search: "", hash: "" }];
  /** @internal */ $index = 0;
  /** @internal */ $window: EventTarget;

  constructor(window: EventTarget) {
    this.$window = window;
  }

  get length(): number {
    return this.$entries.length;
  }

  get state(): unknown {
    return this.$entries[this.$index].state;
  }

  /** @internal */
  get $current(): Entry {
    return this.$entries[this.$index];
  }

  pushState(state: unknown, _title: string, url?: string | null): void {
    const target = url == null ? this.$current : resolve(String(url), this.$current);
    this.$entries.length = this.$index + 1;
    this.$entries.push({ ...target, state });
    this.$index++;
  }

  replaceState(state: unknown, _title: string, url?: string | null): void {
    const target = url == null ? this.$current : resolve(String(url), this.$current);
    this.$entries[this.$index] = { ...target, state };
  }

  go(delta = 0): void {
    const index = this.$index + delta;
    if (delta === 0 || index < 0 || index >= this.$entries.length) return;
    // Like browsers, history traversal is asynchronous.
    setTimeout(() => {
      const oldURL = href(this.$current);
      this.$index = index;
      this.$notify(oldURL);
    });
  }

  back(): void {
    this.go(-1);
  }

  forward(): void {
    this.go(1);
  }

  /** @internal Navigate to `url` like a same-document link click. */
  $navigate(url: string, replace: boolean): void {
    const oldURL = href(this.$current);
    if (replace) this.replaceState(null, "", url);
    else this.pushState(null, "", url);
    this.$notify(oldURL);
  }

  /** @internal */
  $notify(oldURL: string): void {
    const current = this.$current;
    this.$window.dispatchEvent(new PopStateEvent("popstate", { state: current.state }));
    const newURL = href(current);
    if (oldURL.split("#")[1] !== newURL.split("#")[1]) {
      this.$window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL }));
    }
  }
}

function href(entry: Omit<Entry, "state">): string {
  return ORIGIN + entry.pathname + entry.search + entry.hash;
}

export class Location {
  /** @internal */ $history: History;

  constructor(history: History) {
    this.$history = history;
  }

  get href(): string {
    return href(this.$history.$current);
  }

  set href(url: string) {
    this.assign(url);
  }

  get origin(): string {
    return ORIGIN;
  }

  get protocol(): string {
    return "http:";
  }

  get host(): string {
    return "localhost";
  }

  get hostname(): string {
    return "localhost";
  }

  get port(): string {
    return "";
  }

  get pathname(): string {
    return this.$history.$current.pathname;
  }

  set pathname(value: string) {
    const current = this.$history.$current;
    this.assign(`${value.startsWith("/") ? "" : "/"}${value}${current.search}${current.hash}`);
  }

  get search(): string {
    return this.$history.$current.search;
  }

  set search(value: string) {
    const current = this.$history.$current;
    const search = value && !value.startsWith("?") ? `?${value}` : value;
    this.assign(`${current.pathname}${search}${current.hash}`);
  }

  get hash(): string {
    return this.$history.$current.hash;
  }

  set hash(value: string) {
    const hash = value && !value.startsWith("#") ? `#${value}` : value;
    if (hash !== this.hash) this.assign(hash || "#");
  }

  assign(url: string): void {
    this.$history.$navigate(String(url), false);
  }

  replace(url: string): void {
    this.$history.$navigate(String(url), true);
  }

  toString(): string {
    return this.href;
  }
}
