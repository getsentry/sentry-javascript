import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "basic.js": "!function() {
      try {
        var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
        e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
        var n = new e.Error().stack;
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "00000000-0000-0000-0000-000000000000", e._sentryDebugIdIdentifier = "sentry-dbid-00000000-0000-0000-0000-000000000000");
      } catch (e2) {
      }
    }();
    console.log("hello world");
    ",
      "sentry-telemetry.json": "[{"sent_at":"TIMESTAMP","sdk":{"name":"sentry.javascript.node","version":"SDK_VERSION"}},[[{"type":"session"},{"sid":"UUID","init":true,"started":"TIMESTAMP","timestamp":"TIMESTAMP","status":"ok","errors":0,"duration":DURATION,"attrs":{"release":"PLUGIN_VERSION","environment":"production"}}]]],
    [{"event_id":"UUID","sent_at":"TIMESTAMP","sdk":{"name":"sentry.javascript.node","version":"SDK_VERSION"},"trace":{"environment":"production","release":"PLUGIN_VERSION","public_key":"UUID","trace_id":"UUID","org_id":"1","transaction":"Sentry Bundler Plugin execution","sampled":"true","sample_rand":"SAMPLE_RAND","sample_rate":"1"}},[[{"type":"transaction"},{"contexts":{"trace":{"span_id":"SHORT_UUID","trace_id":"UUID","data":{"sentry.origin":"manual","sentry.source":"custom","sentry.sample_rate":1},"origin":"manual"},"runtime":{"name":"node","version":"NODE_VERSION"}},"spans":[],"start_timestamp":START_TIMESTAMP,"timestamp":TIMESTAMP,"transaction":"Sentry Bundler Plugin execution","type":"transaction","transaction_info":{"source":"custom"},"platform":"PLATFORM","event_id":"UUID","environment":"production","release":"PLUGIN_VERSION","tags":{"upload-legacy-sourcemaps":false,"module-metadata":false,"inject-build-information":false,"set-commits":"auto","finalize-release":true,"deploy-options":false,"custom-error-handler":false,"sourcemaps-assets":false,"delete-after-upload":false,"sourcemaps-disabled":false,"react-annotate":false,"node":"NODE_VERSION","platform":"PLATFORM","meta-framework":"none","application-key-set":false,"ci":true,"project":"undefined","bundler":"vite","bundler-major-version":"4"},"user":{},"sdk":{"name":"sentry.javascript.node","version":"SDK_VERSION","integrations":[],"packages":[{"name":"npm:@sentry/node","version":"SDK_VERSION"}]}}]]],
    [{"sent_at":"TIMESTAMP","sdk":{"name":"sentry.javascript.node","version":"SDK_VERSION"}},[[{"type":"session"},{"sid":"UUID","init":false,"started":"TIMESTAMP","timestamp":"TIMESTAMP","status":"exited","errors":0,"duration":DURATION,"attrs":{"release":"PLUGIN_VERSION","environment":"production"}}]]],
    ",
    }
  `);

  const output = runFileInNode("basic.js");
  expect(output).toBe("hello world\n");
});
