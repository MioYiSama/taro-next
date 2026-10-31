export { configure, type ConfigureOptions } from "./app";
export { nextTick } from "./update";

// BOM / DOM globals. The build plugin injects these in place of free references
// (`window`, `document`, ...), which the mini program leaves undefined.
export {
  cancelAnimationFrame,
  customElements,
  document,
  getComputedStyle,
  history,
  localStorage,
  location,
  Navigator,
  navigator,
  performance,
  queueMicrotask,
  requestAnimationFrame,
  screen,
  sessionStorage,
  window,
  window as self,
  Window,
} from "./bom/window";
export { History, Location } from "./bom/history";
export { matchMedia, MediaQueryList } from "./bom/media";
export { Storage } from "./bom/storage";
export { CharacterData, Comment, Text } from "./dom/character-data";
export { Document } from "./dom/document";
export {
  Element,
  HTMLElement,
  HTMLIFrameElement,
  HTMLMediaElement,
  SVGElement,
} from "./dom/element";
export {
  CustomEvent,
  ErrorEvent,
  Event,
  FocusEvent,
  HashChangeEvent,
  KeyboardEvent,
  MiniProgramEvent,
  type MpEvent,
  PopStateEvent,
  type Touch,
} from "./dom/event";
export { EventTarget } from "./dom/event-target";
export { DocumentFragment } from "./dom/fragment";
export { Node } from "./dom/node";
export { MutationObserver } from "./dom/mutation-observer";
export { CSSStyleDeclaration } from "./dom/style";
export { DOMTokenList } from "./dom/class-list";
