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
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "e360fd0a-f174-42e5-a616-ca20792b40f7", e._sentryDebugIdIdentifier = "sentry-dbid-e360fd0a-f174-42e5-a616-ca20792b40f7");
      } catch (e2) {
      }
    })();
    function ComponentA() {
      return /* @__PURE__ */ React.createElement("span", { "data-sentry-component": "ComponentA" }, "Component A");
    }
    function App() {
      return /* @__PURE__ */ React.createElement("span", { "data-sentry-component": "App" }, /* @__PURE__ */ React.createElement(ComponentA, null), ";");
    }
    console.log(App());
    ",
    }
  `);
});
