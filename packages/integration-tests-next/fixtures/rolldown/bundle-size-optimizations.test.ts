import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "bundle.js": "//#region src/bundle.js
    (function() {
    	try {
    		var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
    		e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
    		var n = new e.Error().stack;
    		n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "92a38845-d1ee-42b4-9812-67a76e42b480", e._sentryDebugIdIdentifier = "sentry-dbid-92a38845-d1ee-42b4-9812-67a76e42b480");
    	} catch (e) {}
    })();
    console.log(JSON.stringify({
    	debug: "b",
    	trace: "b",
    	replayCanvas: "a",
    	replayIframe: "a",
    	replayShadowDom: "a",
    	replayWorker: "a"
    }));
    //#endregion
    ",
    }
  `);

  const output = runFileInNode("bundle.js");
  expect(output).toMatchInlineSnapshot(`
    "{"debug":"b","trace":"b","replayCanvas":"a","replayIframe":"a","replayShadowDom":"a","replayWorker":"a"}
    "
  `);
});
