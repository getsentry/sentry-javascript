import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, ctx }) => {
  if (process.platform === "win32") {
    ctx.skip("Query params do not work in paths on Windows");
    return;
  }

  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "common.js?seP58q4g": "!(function() {
      try {
        var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
        e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
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
        e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
        var n = new e.Error().stack;
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "161db429-4399-479c-9466-6ff8ad3344f9", e._sentryDebugIdIdentifier = "sentry-dbid-161db429-4399-479c-9466-6ff8ad3344f9");
      } catch (e2) {
      }
    })();
    import { a as add } from "./common.js?seP58q4g";
    console.log(add(1, 2));
    ",
      "entry2.js": "!(function() {
      try {
        var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
        e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
        var n = new e.Error().stack;
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "a3bc51c0-20dc-4a52-a69a-6a43acf7cd65", e._sentryDebugIdIdentifier = "sentry-dbid-a3bc51c0-20dc-4a52-a69a-6a43acf7cd65");
      } catch (e2) {
      }
    })();
    import { a as add } from "./common.js?seP58q4g";
    console.log(add(2, 4));
    ",
    }
  `);
});
