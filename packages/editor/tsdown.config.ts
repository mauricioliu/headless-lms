import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  external: ["react"],
  fixedExtension: false,
  dts: true,
  clean: true,
});
