/**
 * Mini program component spec shared by the runtime (serialization, event
 * syncing) and the build plugin (WXML template generation). Both sides MUST use
 * the same table, otherwise the data keys produced at runtime won't match the
 * bindings in `base.wxml`.
 */

/**
 * Attribute default value. The type of the default drives value coercion at
 * runtime (e.g. `""`/`"true"` → `true` for boolean attributes) and the default
 * literal used in WXML when the attribute is absent. `null` means "no default,
 * pass the raw value through".
 */
export type AttrDefault = boolean | number | string | null;

export interface ComponentSpec {
  /** WXML attribute name (kebab-case) → default value. */
  attrs: Record<string, AttrDefault>;
  /** Component specific native events, bound with `bind<event>`. */
  events: string[];
  /** Whether the component renders its child nodes. */
  children: boolean;
  /** Whether tap/touch/longpress events are bound. */
  touch: boolean;
}

/** Events every touchable component binds. `tap` is dispatched as DOM `click`. */
export const TOUCH_EVENTS = [
  "tap",
  "touchstart",
  "touchmove",
  "touchend",
  "touchcancel",
  "longpress",
];

/** Attributes accepted by every component. */
export const COMMON_ATTRS: Record<string, AttrDefault> = { hidden: false };

function spec(
  attrs: Record<string, AttrDefault>,
  events: string[] = [],
  { children = true, touch = true }: { children?: boolean; touch?: boolean } = {},
): ComponentSpec {
  return { attrs: { ...COMMON_ATTRS, ...attrs }, events, children, touch };
}

const VIEW_ATTRS = {
  "hover-class": "none",
  "hover-stop-propagation": false,
  "hover-start-time": 50,
  "hover-stay-time": 400,
};

export const COMPONENTS: Record<string, ComponentSpec> = {
  view: spec(VIEW_ATTRS),
  text: spec({ "user-select": false, selectable: false, space: "", decode: false }),
  icon: spec({ type: "", size: 23, color: "" }, [], { children: false }),
  progress: spec(
    {
      percent: 0,
      "show-info": false,
      "border-radius": 0,
      "font-size": 16,
      "stroke-width": 6,
      "active-color": "#09BB07",
      "background-color": "#EBEBEB",
      active: false,
      "active-mode": "backwards",
      duration: 30,
    },
    ["activeend"],
    { children: false },
  ),
  "rich-text": spec({ nodes: null, space: "", "user-select": false }, [], { children: false }),
  button: spec(
    {
      size: "default",
      type: "default",
      plain: false,
      disabled: false,
      loading: false,
      "form-type": "",
      "open-type": "",
      "hover-class": "button-hover",
      "hover-stop-propagation": false,
      "hover-start-time": 20,
      "hover-stay-time": 70,
      lang: "en",
      "session-from": "",
      "send-message-title": "",
      "send-message-path": "",
      "send-message-img": "",
      "app-parameter": "",
      "show-message-card": false,
    },
    [
      "getuserinfo",
      "contact",
      "getphonenumber",
      "getrealtimephonenumber",
      "error",
      "opensetting",
      "launchapp",
      "chooseavatar",
      "agreeprivacyauthorization",
    ],
  ),
  checkbox: spec({ value: "", disabled: false, checked: false, color: "#09BB07" }),
  "checkbox-group": spec({}, ["change"]),
  radio: spec({ value: "", disabled: false, checked: false, color: "#09BB07" }),
  "radio-group": spec({}, ["change"]),
  form: spec({ "report-submit": false, "report-submit-timeout": 0 }, ["submit", "reset"]),
  label: spec({ for: "" }),
  input: spec(
    {
      value: "",
      type: "text",
      password: false,
      placeholder: "",
      "placeholder-style": "",
      "placeholder-class": "input-placeholder",
      disabled: false,
      maxlength: 140,
      "cursor-spacing": 0,
      "auto-focus": false,
      focus: false,
      "confirm-type": "done",
      "always-embed": false,
      "confirm-hold": false,
      cursor: -1,
      "selection-start": -1,
      "selection-end": -1,
      "adjust-position": true,
      "hold-keyboard": false,
    },
    ["input", "focus", "blur", "confirm", "keyboardheightchange", "nicknamereview"],
    { children: false },
  ),
  textarea: spec(
    {
      value: "",
      placeholder: "",
      "placeholder-style": "",
      "placeholder-class": "textarea-placeholder",
      disabled: false,
      maxlength: 140,
      "auto-focus": false,
      focus: false,
      "auto-height": false,
      fixed: false,
      "cursor-spacing": 0,
      cursor: -1,
      "show-confirm-bar": true,
      "selection-start": -1,
      "selection-end": -1,
      "adjust-position": true,
      "hold-keyboard": false,
      "disable-default-padding": false,
      "confirm-type": "return",
      "confirm-hold": false,
    },
    ["input", "focus", "blur", "confirm", "linechange", "keyboardheightchange"],
    { children: false },
  ),
  picker: spec(
    {
      "header-text": "",
      mode: "selector",
      disabled: false,
      range: null,
      "range-key": "",
      value: null,
      start: "",
      end: "",
      fields: "day",
      level: "region",
      "custom-item": "",
    },
    ["change", "cancel", "columnchange"],
  ),
  "picker-view": spec(
    {
      value: null,
      "indicator-style": "",
      "indicator-class": "",
      "mask-style": "",
      "mask-class": "",
      "immediate-change": false,
    },
    ["change", "pickstart", "pickend"],
  ),
  "picker-view-column": spec({}),
  slider: spec(
    {
      min: 0,
      max: 100,
      step: 1,
      disabled: false,
      value: 0,
      "active-color": "#1aad19",
      "background-color": "#e9e9e9",
      "block-size": 28,
      "block-color": "#ffffff",
      "show-value": false,
    },
    ["change", "changing"],
    { children: false },
  ),
  switch: spec({ checked: false, disabled: false, type: "switch", color: "#04BE02" }, ["change"], {
    children: false,
  }),
  "scroll-view": spec(
    {
      "scroll-x": false,
      "scroll-y": false,
      "upper-threshold": 50,
      "lower-threshold": 50,
      "scroll-top": null,
      "scroll-left": null,
      "scroll-into-view": "",
      "scroll-with-animation": false,
      "enable-back-to-top": false,
      "enable-flex": false,
      "scroll-anchoring": false,
      "refresher-enabled": false,
      "refresher-threshold": 45,
      "refresher-default-style": "black",
      "refresher-background": "#FFF",
      "refresher-triggered": false,
      enhanced: false,
      bounces: true,
      "show-scrollbar": true,
      "paging-enabled": false,
      "fast-deceleration": false,
    },
    [
      "scroll",
      "scrolltoupper",
      "scrolltolower",
      "refresherpulling",
      "refresherrefresh",
      "refresherrestore",
      "refresherabort",
      "dragstart",
      "dragging",
      "dragend",
    ],
  ),
  swiper: spec(
    {
      "indicator-dots": false,
      "indicator-color": "rgba(0, 0, 0, .3)",
      "indicator-active-color": "#000000",
      autoplay: false,
      current: 0,
      interval: 5000,
      duration: 500,
      circular: false,
      vertical: false,
      "previous-margin": "0px",
      "next-margin": "0px",
      "snap-to-edge": false,
      "display-multiple-items": 1,
      "easing-function": "default",
    },
    ["change", "transition", "animationfinish"],
  ),
  "swiper-item": spec({ "item-id": "" }),
  "movable-area": spec({ "scale-area": false }),
  "movable-view": spec(
    {
      direction: "none",
      inertia: false,
      "out-of-bounds": false,
      x: null,
      y: null,
      damping: 20,
      friction: 2,
      disabled: false,
      scale: false,
      "scale-min": 0.5,
      "scale-max": 10,
      "scale-value": 1,
      animation: true,
    },
    ["change", "scale", "htouchmove", "vtouchmove"],
  ),
  "cover-view": spec({ "scroll-top": null }),
  "cover-image": spec({ src: "" }, ["load", "error"], { children: false }),
  "root-portal": spec({ enable: true }, [], { touch: false }),
  image: spec(
    {
      src: "",
      mode: "scaleToFill",
      webp: false,
      "lazy-load": false,
      "show-menu-by-longpress": false,
    },
    ["load", "error"],
    { children: false },
  ),
  video: spec(
    {
      src: "",
      duration: null,
      controls: true,
      "danmu-list": null,
      "danmu-btn": false,
      "enable-danmu": false,
      autoplay: false,
      loop: false,
      muted: false,
      "initial-time": 0,
      direction: null,
      "show-progress": true,
      "show-fullscreen-btn": true,
      "show-play-btn": true,
      "show-center-play-btn": true,
      "enable-progress-gesture": true,
      "object-fit": "contain",
      poster: "",
      "show-mute-btn": false,
      title: "",
      "play-btn-position": "bottom",
      "enable-play-gesture": false,
      "auto-pause-if-navigate": true,
      "auto-pause-if-open-native": true,
      "vslide-gesture": false,
      "vslide-gesture-in-fullscreen": true,
      "show-casting-button": false,
      "picture-in-picture-mode": null,
      "enable-auto-rotation": false,
      "show-snapshot-button": false,
    },
    [
      "play",
      "pause",
      "ended",
      "timeupdate",
      "fullscreenchange",
      "waiting",
      "error",
      "progress",
      "loadedmetadata",
      "controlstoggle",
      "enterpictureinpicture",
      "leavepictureinpicture",
      "seekcomplete",
    ],
  ),
  camera: spec(
    {
      mode: "normal",
      resolution: "medium",
      "device-position": "back",
      flash: "auto",
      "frame-size": "medium",
    },
    ["stop", "error", "initdone", "scancode"],
  ),
  canvas: spec({ type: "", "canvas-id": "", "disable-scroll": false }, ["error"]),
  editor: spec(
    {
      "read-only": false,
      placeholder: "",
      "show-img-size": false,
      "show-img-toolbar": false,
      "show-img-resize": false,
    },
    ["ready", "focus", "blur", "input", "statuschange"],
    { children: false },
  ),
  "web-view": spec({ src: "" }, ["message", "load", "error"], { children: false, touch: false }),
};

/**
 * `view` is by far the most frequent node, so it gets cheaper template variants
 * chosen from the element's listeners at serialization time:
 * - `static-view`: no event bindings (element has no listeners)
 * - `click-view`: only `bindtap` (element only listens to `click`)
 * - `catch-view`: like `view` but with `catchtouchmove` (`catchMove` attribute),
 *   which stops the page from scrolling
 */
export const VIEW_VARIANTS = ["static-view", "click-view", "catch-view"] as const;

/** HTML tags that map to a component other than `view`. */
const HTML_TO_COMPONENT: Record<string, string> = {
  img: "image",
};

/** HTML tags rendered as `view` with an `h5-<tag>` class so `base.wxss` can style them. */
export const HTML_TAGS = new Set(
  (
    "a abbr address article aside b bdi bdo blockquote body br caption cite code col colgroup " +
    "data dd del details dfn dialog div dl dt em fieldset figcaption figure footer h1 h2 h3 h4 " +
    "h5 h6 header hgroup hr i ins kbd legend li main mark menu nav ol p pre q s samp section " +
    "small span strong sub summary sup table tbody td tfoot th thead time tr u ul var"
  ).split(" "),
);

/** Resolve the component rendering an element with the given local name. */
export function componentOf(localName: string): string {
  if (localName in COMPONENTS) return localName;
  return HTML_TO_COMPONENT[localName] ?? "view";
}

/**
 * Data key of an attribute. Dashes are dropped and the name is lower-cased so
 * `scroll-y`, `scrollY` and `scrolly` all address the same WXML attribute.
 */
export function attrKey(name: string): string {
  return name.replace(/-/g, "").toLowerCase();
}

/**
 * Serialized node shape (the page `root` data and every `cn` entry):
 * - `nn`: template name (component, view variant, `#text` or `#comment`)
 * - `sid`: runtime node id, also the `wx:key` and `data-sid`
 * - `uid`: WXML `id` (the element `id` attribute, or `sid`)
 * - `cl` / `st`: class / style
 * - `cn`: child nodes
 * - `v`: text content of a `#text` node
 * - attribute values under their {@link attrKey}
 */

export const TEXT_NODE_NAME = "#text";
export const COMMENT_NODE_NAME = "#comment";
