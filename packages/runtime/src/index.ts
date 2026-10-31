class TaroWindow {}

export function start(f: (window: Window) => void) {
  const taroWindow = new TaroWindow();
  globalThis.window = taroWindow;
  f(globalThis.window);
}
