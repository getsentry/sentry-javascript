import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, ctx }) => {
  if (process.platform === "win32") {
    ctx.skip("Query params do not work in paths on Windows");
    return;
  }

  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "common.js?seP58q4g": "//#region src/common.js
    (function() {
    	try {
    		var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
    		e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
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
    		e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
    		var n = new e.Error().stack;
    		n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "bf11f932-fe2b-4b54-97e0-45abde2a0d81", e._sentryDebugIdIdentifier = "sentry-dbid-bf11f932-fe2b-4b54-97e0-45abde2a0d81");
    	} catch (e) {}
    })();
    import { t as add } from "./common.js?seP58q4g";
    //#region src/entry1.js
    console.log(add(1, 2));
    //#endregion
    ",
      "entry2.js": "(function() {
    	try {
    		var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
    		e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
    		var n = new e.Error().stack;
    		n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "5aaa817b-a0e4-4c91-a4f4-aa8f3c26e66e", e._sentryDebugIdIdentifier = "sentry-dbid-5aaa817b-a0e4-4c91-a4f4-aa8f3c26e66e");
    	} catch (e) {}
    })();
    import { t as add } from "./common.js?seP58q4g";
    //#region src/entry2.js
    console.log(add(2, 4));
    //#endregion
    ",
    }
  `);
});
