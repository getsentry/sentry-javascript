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
    		var n = new e.Error().stack;
    		n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "b699d9c1-b033-4536-aa25-233c92609b54", e._sentryDebugIdIdentifier = "sentry-dbid-b699d9c1-b033-4536-aa25-233c92609b54");
    	} catch (e) {}
    })();
    console.log("hello world");
    //#endregion
    ",
      "sentry-telemetry.json": "[{"sent_at":"TIMESTAMP","sdk":{"name":"sentry.javascript.node","version":"8.30.0"}},[[{"type":"session"},{"sid":"UUID","init":false,"started":"TIMESTAMP","timestamp":"TIMESTAMP","status":"exited","errors":0,"duration":DURATION,"attrs":{"release":"PLUGIN_VERSION","environment":"production"}}]]],
    ",
    }
  `);

  const output = runFileInNode("basic.js");
  expect(output).toBe("hello world\n");
});
