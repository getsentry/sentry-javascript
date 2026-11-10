import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler({ SENTRY_TEST_RECORD_UPLOADED_SOURCES: "1" });
  const files = readOutputFiles();

  expect(Object.keys(files).sort()).toMatchInlineSnapshot(`
    [
      "chunk.js",
      "chunk.js.map",
      "entry1.js",
      "entry1.js.map",
      "entry2.js",
      "entry2.js.map",
      "sentry-cli-mock.json",
      "sentry-uploaded-sources.json",
    ]
  `);
  expect(JSON.parse(files["sentry-uploaded-sources.json"]!)).toMatchInlineSnapshot(`
    [
      [
        "sentry-debug-id-stub:_sentry-debug-id-injection-stub?sentry-module-id=00000000-0000-0000-0000-000000000000",
        "../../src/entry1.js",
        "../../src/entry1.js",
      ],
    ]
  `);
  expect(files["sentry-cli-mock.json"]).toMatchInlineSnapshot(`
    "["release","create","CURRENT_SHA","--project","fake-project"],
    ["release","set-commits","CURRENT_SHA","--auto"],
    ["release","finalize","CURRENT_SHA"],
    ["sourcemap","upload","-p","fake-project","--release","CURRENT_SHA","sentry-bundler-plugin-upload-path"],
    "
  `);
});
