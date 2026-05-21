import packageJson from "./package.json" with { type: "json" };

export default {
  platform: "node",
  input: ["src/index.ts"],
  output: [
    {
      file: packageJson.module,
      format: "esm",
      exports: "named",
      sourcemap: true,
    },
  ],
};
