import packageJson from "./package.json" with { type: "json" };
import modulePackage from "module";

export default {
  platform: "node",
  input: ["src/index.ts", "src/webpack5.ts", "src/component-annotation-transform.ts"],
  external: [...Object.keys(packageJson.dependencies), ...modulePackage.builtinModules, "webpack"],
  output: [
    {
      dir: "./dist/esm",
      format: "esm",
      exports: "named",
      sourcemap: true,
      entryFileNames: "[name].mjs",
      chunkFileNames: "[name].mjs",
    },
    {
      dir: "./dist/cjs",
      format: "cjs",
      exports: "named",
      sourcemap: true,
      entryFileNames: "[name].js",
      chunkFileNames: "[name].js",
    },
  ],
};
