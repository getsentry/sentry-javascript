import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, runFileInNode }) => {
  runBundler();

  expect(JSON.parse(runFileInNode("static-injection/strict.cjs"))).toEqual({
    strictModePreserved: true,
    releaseInjected: true,
    debugIdInjected: false,
  });
  expect(JSON.parse(runFileInNode("static-injection/sloppy.cjs"))).toEqual({
    sloppyModePreserved: true,
    releaseInjected: true,
    debugIdInjected: false,
  });
  expect(JSON.parse(runFileInNode("debug-id-injection/strict.cjs"))).toEqual({
    strictModePreserved: true,
    releaseInjected: false,
    debugIdInjected: true,
  });
  expect(JSON.parse(runFileInNode("debug-id-injection/sloppy.cjs"))).toEqual({
    sloppyModePreserved: true,
    releaseInjected: false,
    debugIdInjected: true,
  });
});
