import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "common.js": "!(function() {
      try {
        var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
        var n = new e.Error().stack;
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "d6522b10-3189-4ceb-b9e3-9764b0420211", e._sentryDebugIdIdentifier = "sentry-dbid-d6522b10-3189-4ceb-b9e3-9764b0420211");
      } catch (e2) {
      }
    })();
    function add(a, b) {
      return a + b;
    }
    export {
      add as a
    };
    ",
      "entry1.js": "!(function() {
      try {
        var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
        var n = new e.Error().stack;
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "462efaa9-6efa-471b-94ae-88b2852f0c20", e._sentryDebugIdIdentifier = "sentry-dbid-462efaa9-6efa-471b-94ae-88b2852f0c20");
      } catch (e2) {
      }
    })();
    import { a as add } from "./common.js";
    console.log(add(1, 2));
    ",
      "entry2.js": "!(function() {
      try {
        var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
        var n = new e.Error().stack;
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "0231818d-9e30-4d5b-94a9-3da56ffd79af", e._sentryDebugIdIdentifier = "sentry-dbid-0231818d-9e30-4d5b-94a9-3da56ffd79af");
      } catch (e2) {
      }
    })();
    import { a as add } from "./common.js";
    console.log(add(2, 4));
    ",
    }
  `);

  const output1 = runFileInNode("entry1.js");
  expect(output1).toMatchInlineSnapshot(`
    "3
    "
  `);
  const output2 = runFileInNode("entry2.js");
  expect(output2).toMatchInlineSnapshot(`
    "6
    "
  `);
});
