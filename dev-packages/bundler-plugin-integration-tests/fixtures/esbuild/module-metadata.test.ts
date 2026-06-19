import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "module-metadata.js": "(() => {
      // _sentry-injection-stub
      !(function() {
        try {
          var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
          e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
          e._sentryModuleMetadata = e._sentryModuleMetadata || {}, e._sentryModuleMetadata[new e.Error().stack] = (function(e2) {
            for (var n = 1; n < arguments.length; n++) {
              var a = arguments[n];
              if (null != a) for (var t in a) a.hasOwnProperty(t) && (e2[t] = a[t]);
            }
            return e2;
          })({}, e._sentryModuleMetadata[new e.Error().stack], { "something": "value", "another": 999 });
        } catch (e2) {
        }
      })();

      // sentry-debug-id-stub:_sentry-debug-id-injection-stub?sentry-module-id=00000000-0000-0000-0000-000000000000
      !(function() {
        try {
          var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
          var n = new e.Error().stack;
          n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "00000000-0000-0000-0000-000000000000", e._sentryDebugIdIdentifier = "sentry-dbid-00000000-0000-0000-0000-000000000000");
        } catch (e2) {
        }
      })();

      // src/basic.js
      console.log("hello world");

      // src/basic.js?sentryDebugIdProxy=true
      var basic_default = void 0;
    })();
    ",
    }
  `);

  const output = runFileInNode("module-metadata.js");
  expect(output).toBe("hello world\n");
});
