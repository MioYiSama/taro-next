import taro from "@taro-next/plugin/vite";
import { defineConfig } from "vite-plus";

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
