import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  const files = readOutputFiles();

  expect(Object.keys(files).sort()).toMatchInlineSnapshot(`
    [
      "common.cjs",
      "common.mjs",
      "common.mjs.map",
      "entry1.cjs",
      "entry1.mjs",
      "entry1.mjs.map",
      "entry2.cjs",
      "entry2.mjs",
      "entry2.mjs.map",
      "sentry-cli-mock.json",
    ]
  `);
  // The two outputs write at the same time, so the order of the CLI calls varies.
  expect(files["sentry-cli-mock.json"]!.trim().split("\n").sort()).toMatchInlineSnapshot(`
    [
      "["release","create","CURRENT_SHA","--project","fake-project"],",
      "["release","create","CURRENT_SHA","--project","fake-project"],",
      "["release","finalize","CURRENT_SHA"],",
      "["release","finalize","CURRENT_SHA"],",
      "["release","set-commits","CURRENT_SHA","--auto"],",
      "["release","set-commits","CURRENT_SHA","--auto"],",
      "["sourcemap","upload","-p","fake-project","--release","CURRENT_SHA","sentry-bundler-plugin-upload-path"],",
      "["sourcemap","upload","-p","fake-project","--release","CURRENT_SHA","sentry-bundler-plugin-upload-path"],",
    ]
  `);
});
