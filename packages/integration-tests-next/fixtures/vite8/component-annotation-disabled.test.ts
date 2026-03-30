import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "app.js": "!(function() {
      try {
        var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
        e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
        var n = new e.Error().stack;
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "fad021a7-2309-4b95-9454-c14eaca9c494", e._sentryDebugIdIdentifier = "sentry-dbid-fad021a7-2309-4b95-9454-c14eaca9c494");
      } catch (e2) {
      }
    })();
    function ComponentA() {
      return /* @__PURE__ */ React.createElement("span", null, "Component A");
    }
    function App() {
      return /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(ComponentA, null), ";");
    }
    console.log(App());
    ",
    }
  `);
});
