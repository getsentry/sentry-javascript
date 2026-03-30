import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "basic.js": "!(function() {
      try {
        var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
        e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
        e._sentryModuleMetadata = e._sentryModuleMetadata || {}, e._sentryModuleMetadata[new e.Error().stack] = (function(e2) {
          for (var n2 = 1; n2 < arguments.length; n2++) {
            var a = arguments[n2];
            if (null != a) for (var t in a) a.hasOwnProperty(t) && (e2[t] = a[t]);
          }
          return e2;
        })({}, e._sentryModuleMetadata[new e.Error().stack], { "_sentryBundlerPluginAppKey:1234567890abcdef": true });
        var n = new e.Error().stack;
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "252e0338-8927-4f52-bd57-188131defd0f", e._sentryDebugIdIdentifier = "sentry-dbid-252e0338-8927-4f52-bd57-188131defd0f");
      } catch (e2) {
      }
    })();
    console.log("hello world");
    ",
    }
  `);
});
