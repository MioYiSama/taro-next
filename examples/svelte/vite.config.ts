import { svelte } from "@sveltejs/vite-plugin-svelte";
import taro from "@taro-next/plugin/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    svelte(),
    taro({
      appConfig: {
        window: {
          navigationBarTextStyle: "black",
          navigationBarTitleText: "Weixin",
          navigationBarBackgroundColor: "#ffffff",
        },
      },
    }),
  ],
});
