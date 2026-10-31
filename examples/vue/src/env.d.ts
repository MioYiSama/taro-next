/// <reference types="vite-plus/client" />
import type { MiniProgramEvent } from "@taro-next/runtime";
import type { HTMLAttributes } from "vue";

// Mini program components and events used by this example. Frameworks type
// templates themselves, so each app declares the native components it renders.
declare module "vue" {
  interface InputHTMLAttributes {
    onConfirm?: (event: MiniProgramEvent<{ value: string }>) => void;
  }

  interface IntrinsicElementAttributes {
    "scroll-view": HTMLAttributes & { "scroll-x"?: boolean; "scroll-y"?: boolean };
  }
}
