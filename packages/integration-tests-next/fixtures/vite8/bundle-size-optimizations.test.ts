import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "bundle.js": "!(function() {
      try {
        var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
        e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
        var n = new e.Error().stack;
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "00000000-0000-0000-0000-000000000000", e._sentryDebugIdIdentifier = "sentry-dbid-00000000-0000-0000-0000-000000000000");
      } catch (e2) {
      }
    })();
    console.log(
      JSON.stringify({
        debug: "b",
        trace: "b",
        replayCanvas: "a",
        replayIframe: "a",
        replayShadowDom: "a",
        replayWorker: "a"
      })
    );
    ",
    }
  `);

  const output = runFileInNode("bundle.js");
  expect(output).toMatchInlineSnapshot(`
    "{"debug":"b","trace":"b","replayCanvas":"a","replayIframe":"a","replayShadowDom":"a","replayWorker":"a"}
    "
  `);
});
