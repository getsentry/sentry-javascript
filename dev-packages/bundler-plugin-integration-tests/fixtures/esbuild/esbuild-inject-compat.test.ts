import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ readOutputFiles, runBundler, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "index.js": "(() => {
      // src/inject.ts
      var process = {
        env: {
          FOO: "some-injected-value"
        }
      };
      var global2 = globalThis;

      // _sentry-injection-stub
      !(function() {
        try {
          var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
          e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
        } catch (e2) {
        }
      })();

      // sentry-debug-id-stub:_sentry-debug-id-injection-stub?sentry-module-id=00000000-0000-0000-0000-000000000000
      !(function() {
        try {
          var e = "undefined" != typeof window ? window : "undefined" != typeof global2 ? global2 : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
          var n = new e.Error().stack;
          n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "00000000-0000-0000-0000-000000000000", e._sentryDebugIdIdentifier = "sentry-dbid-00000000-0000-0000-0000-000000000000");
        } catch (e2) {
        }
      })();

      // src/inject-compat-index.ts
      console.log(process.env["FOO"]);

      // src/inject-compat-index.ts?sentryDebugIdProxy=true
      var inject_compat_index_default = void 0;
    })();
    ",
    }
  `);

  const output = runFileInNode("index.js");
  expect(output).toMatchInlineSnapshot(`
    "some-injected-value
    "
  `);
});
