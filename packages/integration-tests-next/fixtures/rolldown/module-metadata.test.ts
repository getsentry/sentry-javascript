import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "basic.js": "//#region src/basic.js
    (function() {
    	try {
    		var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
    		e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
    		e._sentryModuleMetadata = e._sentryModuleMetadata || {}, e._sentryModuleMetadata[new e.Error().stack] = function(e) {
    			for (var n = 1; n < arguments.length; n++) {
    				var a = arguments[n];
    				if (null != a) for (var t in a) a.hasOwnProperty(t) && (e[t] = a[t]);
    			}
    			return e;
    		}({}, e._sentryModuleMetadata[new e.Error().stack], {
    			"something": "value",
    			"another": 999
    		});
    		var n = new e.Error().stack;
    		n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "b699d9c1-b033-4536-aa25-233c92609b54", e._sentryDebugIdIdentifier = "sentry-dbid-b699d9c1-b033-4536-aa25-233c92609b54");
    	} catch (e) {}
    })();
    console.log("hello world");
    //#endregion
    ",
    }
  `);

  const output = runFileInNode("basic.js");
  expect(output).toBe("hello world\n");
});
