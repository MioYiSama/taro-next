import { start } from "@taro-next/runtime";
import { mount } from "svelte";

import App from "./App.svelte";

import "./index.css";

start((window) => {
  mount(App, { target: window.document.body });
});
