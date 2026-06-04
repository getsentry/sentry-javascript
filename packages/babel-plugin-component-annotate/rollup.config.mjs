import packageJson from "./package.json" with { type: "json" };

const deps = Object.keys(packageJson.dependencies ?? {});

export default {
  platform: "node",
  input: ["src/index.ts"],
  external: (id) => deps.some((dep) => id === dep || id.startsWith(`${dep}/`)),
  output: [
    {
      file: packageJson.module,
      format: "esm",
      exports: "named",
      sourcemap: true,
    },
    {
      file: packageJson.main,
      format: "cjs",
      exports: "named",
      sourcemap: true,
    },
  ],
};
