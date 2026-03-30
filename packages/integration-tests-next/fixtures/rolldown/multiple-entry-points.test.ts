import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "common.js": "//#region src/common.js
    (function() {
    	try {
    		var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
    		var n = new e.Error().stack;
    		n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "3f33b953-1cf1-4c05-850d-3f5b805fa101", e._sentryDebugIdIdentifier = "sentry-dbid-3f33b953-1cf1-4c05-850d-3f5b805fa101");
    	} catch (e) {}
    })();
    function add(a, b) {
    	return a + b;
    }
    //#endregion
    export { add as t };
    ",
      "entry1.js": "(function() {
    	try {
    		var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
    		var n = new e.Error().stack;
    		n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "cbcd67c2-83a7-44e1-94e6-9a8ab161f162", e._sentryDebugIdIdentifier = "sentry-dbid-cbcd67c2-83a7-44e1-94e6-9a8ab161f162");
    	} catch (e) {}
    })();
    import { t as add } from "./common.js";
    //#region src/entry1.js
    console.log(add(1, 2));
    //#endregion
    ",
      "entry2.js": "(function() {
    	try {
    		var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
    		var n = new e.Error().stack;
    		n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "a4f71127-2139-4e9f-af54-f35982254569", e._sentryDebugIdIdentifier = "sentry-dbid-a4f71127-2139-4e9f-af54-f35982254569");
    	} catch (e) {}
    })();
    import { t as add } from "./common.js";
    //#region src/entry2.js
    console.log(add(2, 4));
    //#endregion
    ",
    }
  `);

  const output1 = runFileInNode("entry1.js");
  expect(output1).toMatchInlineSnapshot(`
    "3
    "
  `);
  const output2 = runFileInNode("entry2.js");
  expect(output2).toMatchInlineSnapshot(`
    "6
    "
  `);
});
