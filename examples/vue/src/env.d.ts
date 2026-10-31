/// <reference types="vite-plus/client" />
import type { HTMLAttributes } from "vue";

// Mini program components used by this example. Frameworks type
// templates themselves, so each app declares the native components it renders.
declare module "vue" {
  interface IntrinsicElementAttributes {
    "scroll-view": HTMLAttributes & { "scroll-x"?: boolean; "scroll-y"?: boolean };
  }
}
