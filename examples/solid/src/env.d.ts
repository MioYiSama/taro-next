/// <reference types="vite-plus/client" />
import type { MiniProgramEvent } from "@taro-next/runtime";
import "solid-js";

// Mini program components and events used by this example. Frameworks type JSX
// themselves, so each app declares the native components it renders.
declare module "solid-js" {
  namespace JSX {
    interface InputHTMLAttributes<T> {
      onConfirm?: (event: MiniProgramEvent<{ value: string }>) => void;
    }

    interface IntrinsicElements {
      "scroll-view": HTMLAttributes<HTMLElement> & { "scroll-x"?: boolean; "scroll-y"?: boolean };
    }
  }
}
