import { start } from "@taro-next/runtime";

import { greeting } from "./greeting.js";
import legacy from "./legacy.cjs";

import "./index.css";

start(() => {
  // Free references, injected from the runtime.
  const title = document.createElement("h1");
  title.className = "title";
  title.textContent = `${greeting()}, ${legacy()}`;
  document.body.appendChild(title);
  import("./lazy.js").then(({ footer }) => {
    const element = document.createElement("p");
    element.textContent = footer;
    document.body.appendChild(element);
  });
});
