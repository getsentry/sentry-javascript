import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, runFileInNode }) => {
  runBundler();
  const output = runFileInNode("bundle.js");
  expect(output.trimEnd()).toBe('"i am a dangerous release value because I contain a \\""');
});
