import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "basic.js": "!(function() {
      try {
        var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
        e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
        var n = new e.Error().stack;
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "00000000-0000-0000-0000-000000000000", e._sentryDebugIdIdentifier = "sentry-dbid-00000000-0000-0000-0000-000000000000");
      } catch (e2) {
      }
    })();
    console.log("hello world");
    ",
      "sentry-cli-mock.json": "["releases","new","CURRENT_SHA"],
    ["releases","set-commits","CURRENT_SHA","--auto","--ignore-missing"],
    ["releases","finalize","CURRENT_SHA"],
    ["sourcemaps","upload","-p","fake-project","--release","CURRENT_SHA","sentry-bundler-plugin-upload-path","--ignore","node_modules","--no-rewrite"],
    ",
    }
  `);

  const output = runFileInNode("basic.js");
  expect(output).toBe("hello world\n");
});
