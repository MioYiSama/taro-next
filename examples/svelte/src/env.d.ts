/// <reference types="vite-plus/client" />
import type { HTMLAttributes } from "svelte/elements";

// Mini program components used by this example. Frameworks type
// templates themselves, so each app declares the native components it renders.
declare module "svelte/elements" {
  interface SvelteHTMLElements {
    "scroll-view": HTMLAttributes<HTMLElement> & { "scroll-x"?: boolean; "scroll-y"?: boolean };
  }
}
