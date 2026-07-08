import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "build-info.js": "(() => {
      // _sentry-injection-stub
      !(function() {
        try {
          var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
          e.SENTRY_RELEASE = { id: "build-information-injection-test" };
          e.SENTRY_BUILD_INFO = { "deps": ["@sentry/bundler-plugins", "esbuild"], "depsVersions": {}, "nodeVersion":"NODE_VERSION" };
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

  const output = runFileInNode("build-info.js");
  expect(output).toBe("hello world\n");
});
