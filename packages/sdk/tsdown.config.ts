import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  fixedExtension: false,
  platform: "neutral",
  sourcemap: true,
  clean: true,
  dts: true,
});
