import { expect } from "vitest";
import { test } from "./utils";

// Vite rewrites the source map of chunks with dynamic imports after the Sentry plugin stamps
// it. The debug ID must survive that for every chunk.
test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  const files = readOutputFiles();

  expect(files["dynamic-import.js"]).toContain("__vitePreload");

  for (const fileName of ["dynamic-import.js", "import.js"]) {
    const chunk = files[fileName] ?? "";
    const debugId = chunk.match(/sentry-dbid-([0-9a-f-]{36})/)?.[1];
    const map = JSON.parse(files[`${fileName}.map`] ?? "{}");

    expect(debugId).toBeDefined();
    expect(chunk).toContain(`//# debugId=${debugId}`);
    expect(map.debug_id).toBe(debugId);
    expect(map.debugId).toBe(debugId);
  }
});
