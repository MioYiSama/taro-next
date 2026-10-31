let cachedWindow: Partial<WechatMiniprogram.WindowInfo> | null = null;
let cachedApp: Partial<WechatMiniprogram.AppBaseInfo> | null = null;
let cachedDevice: Partial<WechatMiniprogram.DeviceInfo> | null = null;

export function windowInfo(): Partial<WechatMiniprogram.WindowInfo> {
  return (cachedWindow ??=
    typeof wx === "undefined"
      ? {}
      : typeof wx.getWindowInfo === "function"
        ? wx.getWindowInfo()
        : wx.getSystemInfoSync());
}

export function appBaseInfo(): Partial<WechatMiniprogram.AppBaseInfo> {
  return (cachedApp ??=
    typeof wx === "undefined"
      ? {}
      : typeof wx.getAppBaseInfo === "function"
        ? wx.getAppBaseInfo()
        : wx.getSystemInfoSync());
}

export function deviceInfo(): Partial<WechatMiniprogram.DeviceInfo> {
  return (cachedDevice ??=
    typeof wx === "undefined"
      ? {}
      : typeof wx.getDeviceInfo === "function"
        ? wx.getDeviceInfo()
        : wx.getSystemInfoSync());
}

export function resetSystemInfo(): void {
  cachedWindow = cachedApp = cachedDevice = null;
}
