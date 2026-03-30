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
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "7cf1a3cd-d2df-426b-8527-27fd153bf757", e._sentryDebugIdIdentifier = "sentry-dbid-7cf1a3cd-d2df-426b-8527-27fd153bf757");
      } catch (e2) {
      }
    })();
    function ComponentA() {
      return /* @__PURE__ */ React.createElement("span", { "data-sentry-component": "ComponentA", "data-sentry-source-file": "component-a.jsx" }, "Component A");
    }
    function App() {
      return /* @__PURE__ */ React.createElement("span", { "data-sentry-component": "App", "data-sentry-source-file": "app.jsx" }, /* @__PURE__ */ React.createElement(ComponentA, { "data-sentry-element": "ComponentA", "data-sentry-source-file": "app.jsx" }), ";");
    }
    console.log(App());
    ",
    }
  `);
});
