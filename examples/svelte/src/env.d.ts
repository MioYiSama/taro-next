/// <reference types="vite-plus/client" />
import type { MiniProgramEvent } from "@taro-next/runtime";
import type { HTMLAttributes } from "svelte/elements";

// Mini program components and events used by this example. Frameworks type
// templates themselves, so each app declares the native components it renders.
declare module "svelte/elements" {
  interface HTMLInputAttributes {
    onconfirm?: (event: MiniProgramEvent<{ value: string }>) => void;
  }

  interface SvelteHTMLElements {
    "scroll-view": HTMLAttributes<HTMLElement> & { "scroll-x"?: boolean; "scroll-y"?: boolean };
  }
}
