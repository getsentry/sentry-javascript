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
    import { jsx, jsxs } from "../node_modules/.pnpm/react@19.2.4/node_modules/react/jsx-runtime.js";
    //#region src/component-a.jsx
    function ComponentA() {
    	return /* @__PURE__ */ jsx("span", {
    		"data-sentry-component": "ComponentA",
    		"data-sentry-source-file": "component-a.jsx",
    		children: "Component A"
    	});
    }
    //#endregion
    //#region src/app.jsx
    function App() {
    	return /* @__PURE__ */ jsxs("span", {
    		"data-sentry-component": "App",
    		"data-sentry-source-file": "app.jsx",
    		children: [/* @__PURE__ */ jsx(ComponentA, {
    			"data-sentry-element": "ComponentA",
    			"data-sentry-source-file": "app.jsx"
    		}), ";"]
    	});
    }
    //#endregion
    export { App as default };
    ",
    }
  `);
});
