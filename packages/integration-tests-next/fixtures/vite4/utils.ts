import { basename, dirname, join } from "node:path";
import { createTempDir, readAllFiles, runBundler } from "../utils";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { TestContext, test as vitestTest } from "vitest";
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

export function test(url: string, callback: TestCallback) {
  const filePath = fileURLToPath(url);
  const filename = basename(filePath);
  const testName = filename.replace(/\.test\.ts$/, "");
  const outDir = join(cwd, "out", testName);

  // Clear the output directory before running the test
  rmSync(outDir, { recursive: true, force: true });

  // Detect CJS config files by test name suffix
  const configExt = testName.endsWith("-cjs") ? ".config.cjs" : ".config.ts";

  vitestTest(`Vite v4 > ${testName}`, (ctx) =>
    callback({
      outDir,
      runBundler: (env) =>
        runBundler(
          `pnpm vite build --config ${testName}${configExt}`,
          {
            cwd,
            env: {
              ...process.env,
              ...env,
              NODE_ENV: "production",
            },
          },
          outDir
        ),
      readOutputFiles: () => readAllFiles(outDir),
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
