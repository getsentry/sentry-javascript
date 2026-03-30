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
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "5950dfde-7033-4e00-a69c-652e1b5bc157", e._sentryDebugIdIdentifier = "sentry-dbid-5950dfde-7033-4e00-a69c-652e1b5bc157");
      } catch (e2) {
      }
    })();
    import { jsx, jsxs } from "../node_modules/.pnpm/react@19.2.4/node_modules/react/jsx-runtime.js";
    function ComponentA() {
      return /* @__PURE__ */ jsx("span", { children: "Component A" });
    }
    function App() {
      return /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx(ComponentA, {}),
        ";"
      ] });
    }
    console.log(App());
    ",
    }
  `);
});
