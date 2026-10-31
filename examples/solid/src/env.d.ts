/// <reference types="vite-plus/client" />
import "solid-js";

// Mini program components used by this example. Frameworks type JSX
// themselves, so each app declares the native components it renders.
declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      "scroll-view": HTMLAttributes<HTMLElement> & { "scroll-x"?: boolean; "scroll-y"?: boolean };
    }
  }
}
