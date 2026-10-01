import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { test } from "./utils";

// Vite rewrites the source map of chunks with dynamic imports after the Sentry plugin stamps it.
// The debug ID must survive that for every chunk. Files are read raw here because
// `readOutputFiles` zeroes debug IDs, which would hide a mismatch between chunk and map.
test(import.meta.url, ({ runBundler, outDir }) => {
  runBundler();

  const entry = readFileSync(join(outDir, "dynamic-import.js"), "utf-8");
  expect(entry).toContain("__vitePreload");

  for (const fileName of ["dynamic-import.js", "import.js"]) {
    const chunk = readFileSync(join(outDir, fileName), "utf-8");
    const debugId = chunk.match(/sentry-dbid-([0-9a-f-]{36})/)?.[1];
    const map = JSON.parse(readFileSync(join(outDir, `${fileName}.map`), "utf-8"));

    expect(debugId).toBeDefined();
    expect(chunk).toContain(`//# debugId=${debugId}`);
    expect(map.debug_id).toBe(debugId);
    expect(map.debugId).toBe(debugId);
  }
});
