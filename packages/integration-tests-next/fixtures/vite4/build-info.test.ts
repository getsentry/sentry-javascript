import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "basic.js": "!(function() {
      try {
        var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
        e.SENTRY_RELEASE = { id: "build-information-injection-test" };
        e.SENTRY_BUILD_INFO = { "deps": ["@sentry/vite-plugin", "@vitejs/plugin-react", "react", "vite"], "depsVersions": { "react": 19, "vite": 4 }, "nodeVersion":"NODE_VERSION" };
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
