import { expect } from "vitest";
import { test } from "./utils";
import { existsSync } from "node:fs";
import { join } from "node:path";

test(import.meta.url, ({ runBundler, outDir, runFileInNode }) => {
  runBundler();

  // Verify the JS file exists and works
  const output = runFileInNode("basic.js");
  expect(output).toBe("hello world\n");

  // Verify the sourcemap was deleted (by the Promise)
  const sourcemapPath = join(outDir, "basic.js.map");
  expect(existsSync(sourcemapPath)).toBe(false);
});
