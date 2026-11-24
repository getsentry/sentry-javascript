import { expect } from "vitest";
import { test } from "./utils";

// Route-based file names like `[id].js` contain glob characters, so the upload must not read them as a pattern.
test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler({ SENTRY_TEST_RECORD_UPLOADED_SOURCES: "1" });
  const uploaded = readOutputFiles()["sentry-uploaded-sources.json"];

  expect(JSON.parse(uploaded ?? "[]")).toEqual([expect.arrayContaining(["../../src/basic.js"])]);
});
