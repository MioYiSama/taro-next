/**
 * Compact runtime attribute kinds. Defaults and native events live in the
 * plugin; its component drift test keeps both sides of the wire in sync.
 */
export const SPECS: Record<string, string> = {
  "view": "hidden! hoverclass hoverstoppropagation! hoverstarttime# hoverstaytime#",
  "text": "hidden! userselect! selectable! space decode!",
  "icon": "~ hidden! type size# color",
  "progress": "~ hidden! percent# showinfo! borderradius# fontsize# strokewidth# activecolor backgroundcolor active! activemode duration#",
  "rich-text": "~ hidden! nodes* space userselect!",
  "button": "hidden! size type plain! disabled! loading! formtype opentype hoverclass hoverstoppropagation! hoverstarttime# hoverstaytime# lang sessionfrom sendmessagetitle sendmessagepath sendmessageimg appparameter showmessagecard!",
  "checkbox": "hidden! value disabled! checked! color",
  "checkbox-group": "hidden!",
  "radio": "hidden! value disabled! checked! color",
  "radio-group": "hidden!",
  "form": "hidden! reportsubmit! reportsubmittimeout#",
  "label": "hidden! for",
  "input": "~ hidden! value type password! placeholder placeholderstyle placeholderclass disabled! maxlength# cursorspacing# autofocus! focus! confirmtype alwaysembed! confirmhold! cursor# selectionstart# selectionend# adjustposition! holdkeyboard!",
  "textarea": "~ hidden! value placeholder placeholderstyle placeholderclass disabled! maxlength# autofocus! focus! autoheight! fixed! cursorspacing# cursor# showconfirmbar! selectionstart# selectionend# adjustposition! holdkeyboard! disabledefaultpadding! confirmtype confirmhold!",
  "picker": "hidden! headertext mode disabled! range* rangekey value* start end fields level customitem",
  "picker-view": "hidden! value* indicatorstyle indicatorclass maskstyle maskclass immediatechange!",
  "picker-view-column": "hidden!",
  "slider": "~ hidden! min# max# step# disabled! value# activecolor backgroundcolor blocksize# blockcolor showvalue!",
  "switch": "~ hidden! checked! disabled! type color",
  "scroll-view": "hidden! scrollx! scrolly! upperthreshold# lowerthreshold# scrolltop* scrollleft* scrollintoview scrollwithanimation! enablebacktotop! enableflex! scrollanchoring! refresherenabled! refresherthreshold# refresherdefaultstyle refresherbackground refreshertriggered! enhanced! bounces! showscrollbar! pagingenabled! fastdeceleration!",
  "swiper": "hidden! indicatordots! indicatorcolor indicatoractivecolor autoplay! current# interval# duration# circular! vertical! previousmargin nextmargin snaptoedge! displaymultipleitems# easingfunction",
  "swiper-item": "hidden! itemid",
  "movable-area": "hidden! scalearea!",
  "movable-view": "hidden! direction inertia! outofbounds! x* y* damping# friction# disabled! scale! scalemin# scalemax# scalevalue# animation!",
  "cover-view": "hidden! scrolltop*",
  "cover-image": "~ hidden! src",
  "root-portal": "hidden! enable!",
  "image": "~ hidden! src mode webp! lazyload! showmenubylongpress!",
  "video": "hidden! src duration* controls! danmulist* danmubtn! enabledanmu! autoplay! loop! muted! initialtime# direction* showprogress! showfullscreenbtn! showplaybtn! showcenterplaybtn! enableprogressgesture! objectfit poster showmutebtn! title playbtnposition enableplaygesture! autopauseifnavigate! autopauseifopennative! vslidegesture! vslidegestureinfullscreen! showcastingbutton! pictureinpicturemode* enableautorotation! showsnapshotbutton!",
  "camera": "hidden! mode resolution deviceposition flash framesize",
  "canvas": "hidden! type canvasid disablescroll!",
  "editor": "~ hidden! readonly! placeholder showimgsize! showimgtoolbar! showimgresize!",
  "web-view": "~ hidden! src",
};

type Kind = "b" | "n" | "s" | "r";
const kinds = new Map<string, { attrs: Map<string, Kind>; leaf: boolean }>();

/** Lazily decode a component's attribute kinds. */
export function kindsOf(component: string): { attrs: Map<string, Kind>; leaf: boolean } {
  let result = kinds.get(component);
  if (!result) {
    const attrs = new Map<string, Kind>();
    const tokens = SPECS[component].split(" ");
    const leaf = tokens[0] === "~";
    for (let i = leaf ? 1 : 0; i < tokens.length; i++) {
      const token = tokens[i];
      const suffix = token.slice(-1);
      const kind = suffix === "!" ? "b" : suffix === "#" ? "n" : suffix === "*" ? "r" : "s";
      attrs.set(kind === "s" ? token : token.slice(0, -1), kind);
    }
    result = { attrs, leaf };
    kinds.set(component, result);
  }
  return result;
}

export const HOVER_KEYS = new Set([
  "hoverclass",
  "hoverstoppropagation",
  "hoverstarttime",
  "hoverstaytime",
]);

export const INPUT_TYPES: Record<string, string> = { checkbox: "switch", range: "slider" };

/**
 * `view` is by far the most frequent node, so it gets cheaper template variants
 * chosen at serialization time from the touch events (`click` included)
 * listened to on the element or its ancestors, the document and the window:
 * - `static-view`: no event bindings (no such listener)
 * - `click-view`: only `mut-bind:tap` (only `click` listeners)
 * - `catch-view`: like `view` but with `catchtouchmove` (`catchMove` attribute),
 *   which stops the page from scrolling
 * Hover attributes also force the full `view` template.
 */
export const VIEW_VARIANTS = ["static-view", "click-view", "catch-view"] as const;

/** HTML tags that map to a component other than `view`. */
export const HTML_TO_COMPONENT: Record<string, string> = {
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
export function componentOf(localName: string, type?: string | null): string {
  if (localName === "input") return INPUT_TYPES[type?.toLowerCase() ?? ""] ?? "input";
  if (localName in SPECS) return localName;
  return HTML_TO_COMPONENT[localName] ?? "view";
}

const attrKeys = new Map<string, string>();

/**
 * Data key of an attribute. Dashes are dropped and the name is lower-cased so
 * `scroll-y`, `scrollY` and `scrolly` all address the same WXML attribute.
 */
export function attrKey(name: string): string {
  let key = attrKeys.get(name);
  if (key === undefined) {
    key = name.replace(/-/g, "").toLowerCase();
    attrKeys.set(name, key);
  }
  return key;
}

/**
 * Serialized node shape (the page `root` data and every `cn` entry):
 * - `nn`: template name (component, view variant, `#text` or `#comment`)
 * - `sid`: runtime node id, also the `wx:key` and `data-sid`
 * - `id`: WXML `id`, only sent for a non-empty element `id` attribute
 * - `cl` / `st`: class / style
 * - `cn`: child nodes
 * - `v`: text content of a `#text` node
 * - attribute values under their {@link attrKey}
 */

export const TEXT_NODE_NAME = "#text";
export const COMMENT_NODE_NAME = "#comment";
