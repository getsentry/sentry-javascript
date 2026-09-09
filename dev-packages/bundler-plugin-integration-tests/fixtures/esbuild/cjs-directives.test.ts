import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, runFileInNode }) => {
  runBundler();

  expect(JSON.parse(runFileInNode("static-injection.cjs"))).toEqual({
    strictModePreserved: true,
    sloppyModePreserved: true,
    releaseInjected: true,
    debugIdInjected: false,
  });
  expect(JSON.parse(runFileInNode("debug-id-injection.cjs"))).toEqual({
    strictModePreserved: true,
    sloppyModePreserved: true,
    releaseInjected: false,
    debugIdInjected: true,
  });
});
