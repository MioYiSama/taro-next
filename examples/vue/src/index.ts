import { start } from "@taro-next/runtime";
import { createApp } from "vue";

import App from "./App.vue";

import "./index.css";

start((window) => {
  createApp(App).mount(window.document.body);
});
