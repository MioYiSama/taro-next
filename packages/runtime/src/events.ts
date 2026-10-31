import { kindsOf } from "./components";
import type { Element } from "./dom/element";
import { FocusEvent, KeyboardEvent, MiniProgramEvent, type MpEvent } from "./dom/event";
import { findNode } from "./update";

/** Events that bubble in the DOM; everything else is dispatched non-bubbling. */
const BUBBLES: Record<string, true> = {
  click: true,
  touchstart: true,
  touchmove: true,
  touchend: true,
  touchcancel: true,
  longpress: true,
  input: true,
  change: true,
  submit: true,
  reset: true,
};

/**
 * Native input bypasses property setters installed by frameworks (such as
 * React's value tracking), just as user input does in the browser.
 */
function syncState(element: Element, type: string, detail: Record<string, unknown>): void {
  const attrs = kindsOf(element.$component).attrs;
  if (
    (type === "input" || type === "change" || type === "changing" || type === "confirm") &&
    "value" in detail
  ) {
    const value = detail.value;
    if (element.$component === "switch") element.setAttribute("checked", !!value);
    else if (element.$component === "checkbox-group" || element.$component === "radio-group") {
      const selected = Array.isArray(value) ? value.map(String) : [String(value)];
      const kind = element.$component === "checkbox-group" ? "checkbox" : "radio";
      for (const item of element.querySelectorAll(kind)) {
        item.setAttribute("checked", selected.includes(String(item.value)));
      }
    } else if (attrs.has("value")) element.setAttribute("value", value ?? "");
  }
  if (type === "change" && "current" in detail && attrs.has("current")) {
    element.setAttribute("current", detail.current);
  }
}

let lastEvent = "";

/** Bridge a native event (bound as `eh` in the templates) into the DOM. */
export function handleEvent(mpEvent: MpEvent): void {
  const targetSid = mpEvent.target?.dataset.sid as string | undefined;
  const currentSid = mpEvent.currentTarget?.dataset.sid as string | undefined;
  // Safety net for native events delivered by more than one binding.
  const key = `${mpEvent.type}:${mpEvent.timeStamp}:${targetSid ?? currentSid}`;
  if (key === lastEvent) return;
  lastEvent = key;

  const node = (targetSid && findNode(targetSid)) || (currentSid && findNode(currentSid));
  if (!node || node.nodeType !== 1) return;
  const element = node as Element;
  const checkbox = element.localName === "input" && element.$component === "switch";
  const range = element.localName === "input" && element.$component === "slider";
  if (checkbox && mpEvent.type === "tap") return;

  const detail = mpEvent.detail as Record<string, unknown> | undefined;
  const previousValue = range ? String(element.value) : undefined;
  if (detail && typeof detail === "object") syncState(element, mpEvent.type, detail);
  const dispatch = (type: string): void => {
    element.dispatchEvent(
      new MiniProgramEvent(type, { bubbles: !!BUBBLES[type], cancelable: true, detail }, mpEvent),
    );
  };

  if (mpEvent.type === "focus" || mpEvent.type === "blur") {
    const focus = mpEvent.type === "focus";
    const document = element.ownerDocument;
    if (document) {
      if (focus) document.$activeElement = element;
      else if (document.$activeElement === element) document.$activeElement = null;
    }
    for (const type of focus ? ["focus", "focusin"] : ["blur", "focusout"]) {
      const event = new FocusEvent(type, { bubbles: type === "focusin" || type === "focusout" });
      event.isTrusted = true;
      event.timeStamp = mpEvent.timeStamp;
      element.dispatchEvent(event);
    }
    return;
  }
  if (checkbox && mpEvent.type === "change") {
    dispatch("click");
    dispatch("input");
    dispatch("change");
    return;
  }
  if (range && (mpEvent.type === "changing" || mpEvent.type === "change")) {
    if (mpEvent.type === "changing" || String(element.value) !== previousValue) dispatch("input");
    if (mpEvent.type === "change") dispatch("change");
    return;
  }
  if (mpEvent.type === "confirm" && element.$component === "input") {
    const keyboard = (type: string): void => {
      const event = new KeyboardEvent(type, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      });
      event.isTrusted = true;
      event.timeStamp = mpEvent.timeStamp;
      element.dispatchEvent(event);
    };
    keyboard("keydown");
    dispatch("confirm");
    keyboard("keyup");
    return;
  }
  dispatch(mpEvent.type === "tap" ? "click" : mpEvent.type);
}
