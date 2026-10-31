import taro from "@taro-next/plugin/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Native mini program components, rendered as is.
          isCustomElement: (tag) => tag === "scroll-view",
        },
      },
    }),
    taro({
      projectConfig: {
        appid: "wx1234",
      },
      appConfig: {
        window: {
          navigationBarTextStyle: "black",
          navigationBarTitleText: "Weixin",
          navigationBarBackgroundColor: "#ffffff",
        },
      },
      pageConfig: {},
    }),
  ],
});
