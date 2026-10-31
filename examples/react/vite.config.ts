import taro from "@taro-next/plugin/vite";
import { defineConfig } from "vite-plus";

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
