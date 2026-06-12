import { basename, dirname, join } from "node:path";
import { createTempDir, readAllFiles, runBundler } from "../utils";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import type { TestContext } from "vitest";
import { test as vitestTest } from "vitest";
import { execSync } from "node:child_process";

const cwd = dirname(fileURLToPath(import.meta.url));

type TestCallback = (props: {
  outDir: string;
  runBundler: (env?: Record<string, string | undefined>) => void;
  readOutputFiles: () => Record<string, string>;
  runFileInNode: (file: string) => string;
  createTempDir: () => string;
  ctx: TestContext;
}) => void | Promise<void>;

function esbuildReplacer(content: string): string {
  // esbuild ends up with different debug IDs and UUIDs on different platforms
  // so we replace them with placeholders to make snapshots deterministic
  return content.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    "00000000-0000-0000-0000-000000000000"
  );
}

export function test(url: string, callback: TestCallback) {
  const filePath = fileURLToPath(url);
  const filename = basename(filePath);
  const testName = filename.replace(/\.test\.ts$/, "");
  const outDir = join(cwd, "out", testName);

  // Clear the output directory before running the test
  rmSync(outDir, { recursive: true, force: true });

  // Detect CJS config files by test name suffix
  const configExt = testName.endsWith("-cjs") ? ".config.cjs" : ".config.js";

  vitestTest(`esbuild > ${testName}`, (ctx) =>
    callback({
      outDir,
      runBundler: (env) =>
        runBundler(
          `node ${testName}${configExt}`,
          {
            cwd,
            env: {
              ...process.env,
              ...env,
            },
          },
          outDir
        ),
      readOutputFiles: () => readAllFiles(outDir, esbuildReplacer),
      runFileInNode: (file) => {
        const fullPath = join(outDir, file);
        return execSync(`node ${fullPath}`, {
          cwd,
          env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
        }).toString();
      },
      createTempDir: () => createTempDir(),
      ctx,
    })
  );
}
