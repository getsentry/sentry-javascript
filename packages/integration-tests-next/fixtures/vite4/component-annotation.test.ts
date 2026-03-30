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
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "d2aba7de-9acd-4eaf-8153-269a881dd7a6", e._sentryDebugIdIdentifier = "sentry-dbid-d2aba7de-9acd-4eaf-8153-269a881dd7a6");
      } catch (e2) {
      }
    })();
    import { jsx, jsxs } from "../node_modules/.pnpm/react@19.2.4/node_modules/react/jsx-runtime.js";
    function ComponentA() {
      return /* @__PURE__ */ jsx("span", { "data-sentry-component": "ComponentA", "data-sentry-source-file": "component-a.jsx", children: "Component A" });
    }
    function App() {
      return /* @__PURE__ */ jsxs("span", { "data-sentry-component": "App", "data-sentry-source-file": "app.jsx", children: [
        /* @__PURE__ */ jsx(ComponentA, { "data-sentry-element": "ComponentA", "data-sentry-source-file": "app.jsx" }),
        ";"
      ] });
    }
    console.log(App());
    ",
    }
  `);
});
