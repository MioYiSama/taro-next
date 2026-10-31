/// <reference types="vite-plus/client" />
import type { MiniProgramEvent } from "@taro-next/runtime";
import "preact";

// Mini program components and events used by this example. Frameworks type JSX
// themselves, so each app declares the native components it renders.
declare module "preact" {
  interface HTMLAttributes {
    onConfirm?: (event: MiniProgramEvent<{ value: string }>) => void;
  }

  namespace JSX {
    interface IntrinsicElements {
      "scroll-view": HTMLAttributes<HTMLElement> & { "scroll-x"?: boolean; "scroll-y"?: boolean };
    }
  }
}
