import packageJson from "./package.json" with { type: "json" };
import modulePackage from "module";

export default {
  platform: "node",
  input: ["src/index.ts", "src/webpack5.ts"],
  external: (id) =>
    [...Object.keys(packageJson.dependencies), ...modulePackage.builtinModules].some(
      (dep) => id === dep || id.startsWith(`${dep}/`)
    ),
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
