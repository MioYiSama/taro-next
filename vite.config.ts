import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    sortImports: true,
    sortPackageJson: true,
  },
});
