import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler({ SENTRY_TEST_RECORD_UPLOADED_SOURCES: "1" });
  const files = readOutputFiles();

  expect(Object.keys(files).sort()).toMatchInlineSnapshot(`
    [
      "common.js",
      "common.js.map",
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
        "../../src/common.js",
      ],
      [
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
