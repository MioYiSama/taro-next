import { start } from "@taro-next/runtime";
import { render } from "preact";

start((window) => {
  render(<p>1</p>, window.document.body);
});
