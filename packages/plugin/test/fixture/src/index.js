import { greeting } from "./greeting.js";
import legacy from "./legacy.cjs";

import "./index.css";

// Free references, injected from the runtime.
const title = document.createElement("h1");
title.className = "title";
title.textContent = `${greeting()}, ${legacy()}`;
document.body.appendChild(title);
const mode = document.createElement("div");
mode.textContent = `mode ${process.env.NODE_ENV}`;
document.body.appendChild(mode);
document.body.appendChild(document.createElement("scroll-view"));
import("./lazy.js").then(({ footer }) => {
  const element = document.createElement("p");
  element.textContent = footer;
  document.body.appendChild(element);
});
