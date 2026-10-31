import { defineConfig } from "vite-plus";
import taro from "@taro-next/plugin/vite";

export default defineConfig({
  plugins: [
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
