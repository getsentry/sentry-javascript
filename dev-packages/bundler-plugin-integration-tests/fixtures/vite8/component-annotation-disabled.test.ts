import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "app.js": "(function() {
    	try {
    		var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
    		e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
    		var n = new e.Error().stack;
    		n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "00000000-0000-0000-0000-000000000000", e._sentryDebugIdIdentifier = "sentry-dbid-00000000-0000-0000-0000-000000000000");
    	} catch (e) {}
    })();
    import { jsxDEV } from "../node_modules/.pnpm/react@19.2.4/node_modules/react/jsx-dev-runtime.js";
    //#region src/component-a.jsx
    var _jsxFileName$1 = "/fixtures/vite8/src/component-a.jsx";
    function ComponentA() {
    	return /* @__PURE__ */ jsxDEV("span", { children: "Component A" }, void 0, false, {
    		fileName: _jsxFileName$1,
    		lineNumber: 2,
    		columnNumber: 10
    	}, this);
    }
    //#endregion
    //#region src/app.jsx
    var _jsxFileName = "/fixtures/vite8/src/app.jsx";
    function App() {
    	return /* @__PURE__ */ jsxDEV("span", { children: [/* @__PURE__ */ jsxDEV(ComponentA, {}, void 0, false, {
    		fileName: _jsxFileName,
    		lineNumber: 6,
    		columnNumber: 7
    	}, this), ";"] }, void 0, true, {
    		fileName: _jsxFileName,
    		lineNumber: 5,
    		columnNumber: 5
    	}, this);
    }
    console.log(App());
    //#endregion
    ",
    }
  `);
});
