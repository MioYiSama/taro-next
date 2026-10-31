import taro from "@taro-next/plugin/vite";
import solid from "vite-plugin-solid";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    solid(),
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
