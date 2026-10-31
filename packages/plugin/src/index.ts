import { createUnplugin, type UnpluginFactory } from "unplugin";
import pkg from "../package.json";

export interface Options {
  projectConfig?: any;

  appConfig?: any;
}

export const unplugin: UnpluginFactory<Options | null | undefined> = (options) => {
  // oxlint-disable-next-line no-empty-pattern
  const {} = options ?? {};

  return {
    name: pkg.name,
  };
};

export default createUnplugin(unplugin);
