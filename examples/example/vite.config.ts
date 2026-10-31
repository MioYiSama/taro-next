import { defineConfig } from "vite-plus";
import taro from "@taro-next/plugin/vite";

export default defineConfig({
  plugins: [
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
