import { describe, expect, it } from "vitest";
import * as ts from "typescript";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const fixturesDir = fileURLToPath(new URL(".", import.meta.url));
// Use the built declaration (not the source): `skipLibCheck` skips deep-checking it and its
// `../core`/`../rollup` `.d.ts` imports, so the test only checks that the plugin's *public*
// type is assignable to vite's `defineConfig` plugins — which is what the test is about.
const pluginTypesFile = fileURLToPath(
  new URL("../../../packages/bundler-plugins/build/types/vite/index.d.ts", import.meta.url)
);
const pluginViteTypesFixtureDir = join(fixturesDir, "vite6");

const configSource = `
import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";

export default defineConfig({
  plugins: [sentryVitePlugin()],
});
`;

function assertFixtureViteVersion(fixtureDir: string, expectedMajor: string): void {
  const requireFromFixture = createRequire(join(fixtureDir, "package.json"));
  const vitePackageJsonPath = requireFromFixture.resolve("vite/package.json");
  const relativeVitePackageJsonPath = relative(fixtureDir, vitePackageJsonPath);

  expect(isAbsolute(relativeVitePackageJsonPath)).toBe(false);
  expect(relativeVitePackageJsonPath.startsWith("..")).toBe(false);
  expect(relativeVitePackageJsonPath.split(/[\\/]/)[0]).toBe("node_modules");

  const vitePackageJson = requireFromFixture("vite/package.json") as { version: string };
  expect(vitePackageJson.version.split(".")[0]).toBe(expectedMajor);
}

function getDiagnosticsForFixture(fixtureName: string, expectedMajor: string): string[] {
  const fixtureDir = join(fixturesDir, fixtureName);
  const fileName = join(fixtureDir, "sentry-vite-plugin-type-compat.mts");
  const isVirtualConfigFile = (path: string) => normalize(path) === normalize(fileName);

  assertFixtureViteVersion(fixtureDir, expectedMajor);
  assertFixtureViteVersion(pluginViteTypesFixtureDir, "6");

  const compilerOptions: ts.CompilerOptions = {
    esModuleInterop: true,
    module: ts.ModuleKind.Node16,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2020,
    types: ["node"],
  };

  const host = ts.createCompilerHost(compilerOptions);
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const getSourceFile = host.getSourceFile;

  host.fileExists = (path) => isVirtualConfigFile(path) || ts.sys.fileExists(path);
  host.readFile = (path) => (isVirtualConfigFile(path) ? configSource : ts.sys.readFile(path));
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) =>
    isVirtualConfigFile(path)
      ? ts.createSourceFile(path, configSource, languageVersion, true)
      : getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);
  host.resolveModuleNames = (moduleNames, containingFile) =>
    moduleNames.map((moduleName) => {
      if (moduleName === "@sentry/bundler-plugins/vite") {
        return {
          resolvedFileName: pluginTypesFile,
          extension: ts.Extension.Dts,
        };
      }

      // The built declarations import each other with extensionless relative paths
      // (e.g. `../core`, `../rollup`), which the Node16 resolver below can't resolve.
      // Resolve them to their sibling `.d.ts`; `skipLibCheck` then skips checking them.
      const pluginTypesDir = dirname(dirname(pluginTypesFile));
      if (
        (moduleName.startsWith("./") || moduleName.startsWith("../")) &&
        containingFile.startsWith(pluginTypesDir)
      ) {
        const base = join(dirname(containingFile), moduleName);
        for (const candidate of [`${base}.d.ts`, join(base, "index.d.ts")]) {
          if (ts.sys.fileExists(candidate)) {
            return { resolvedFileName: candidate, extension: ts.Extension.Dts };
          }
        }
      }

      return ts.resolveModuleName(
        moduleName,
        containingFile,
        compilerOptions,
        ts.sys,
        undefined,
        undefined,
        ts.ModuleKind.ESNext
      ).resolvedModule;
    });

  const program = ts.createProgram([fileName], compilerOptions, host);

  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
    .filter((message) => !message.includes("The current file is a CommonJS module"));
}

describe("sentryVitePlugin type compatibility", () => {
  it.each([
    ["vite6", "6"],
    ["vite7", "7"],
    ["vite8", "8"],
  ])("is compatible with %s defineConfig plugins", (fixtureName, expectedMajor) => {
    expect(getDiagnosticsForFixture(fixtureName, expectedMajor)).toEqual([]);
  });
});
