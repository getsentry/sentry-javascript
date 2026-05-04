import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "sentry-telemetry.json": "[{"sent_at":"TIMESTAMP","sdk":{"name":"sentry.javascript.node","version":"8.30.0"}},[[{"type":"session"},{"sid":"UUID","init":true,"started":"TIMESTAMP","timestamp":"TIMESTAMP","status":"ok","errors":0,"duration":DURATION,"attrs":{"release":"PLUGIN_VERSION","environment":"production"}}]]],
    [{"event_id":"UUID","sent_at":"TIMESTAMP","sdk":{"name":"sentry.javascript.node","version":"8.30.0"},"trace":{"environment":"production","release":"PLUGIN_VERSION","public_key":"UUID","trace_id":"UUID","sample_rate":"1","transaction":"Sentry Bundler Plugin execution","sampled":"true"}},[[{"type":"transaction"},{"contexts":{"trace":{"span_id":"SHORT_UUID","trace_id":"UUID","data":{"sentry.origin":"manual","sentry.source":"custom","sentry.sample_rate":1},"origin":"manual"},"runtime":{"name":"node","version":"NODE_VERSION"}},"spans":[],"start_timestamp":START_TIMESTAMP,"timestamp":TIMESTAMP,"transaction":"Sentry Bundler Plugin execution","type":"transaction","transaction_info":{"source":"custom"},"platform":"PLATFORM","event_id":"UUID","environment":"production","release":"PLUGIN_VERSION","tags":{"upload-legacy-sourcemaps":false,"module-metadata":false,"inject-build-information":false,"set-commits":"auto","finalize-release":true,"deploy-options":false,"custom-error-handler":false,"sourcemaps-assets":false,"delete-after-upload":false,"sourcemaps-disabled":false,"react-annotate":false,"node":"NODE_VERSION","platform":"PLATFORM","meta-framework":"none","application-key-set":false,"ci":true,"project":"undefined","bundler":"esbuild","bundler-major-version":"28"},"sdk":{"name":"sentry.javascript.node","version":"8.30.0","integrations":[],"packages":[{"name":"npm:@sentry/node","version":"8.30.0"}]}}]]],
    [{"sent_at":"TIMESTAMP","sdk":{"name":"sentry.javascript.node","version":"8.30.0"}},[[{"type":"session"},{"sid":"UUID","init":false,"started":"TIMESTAMP","timestamp":"TIMESTAMP","status":"exited","errors":0,"duration":DURATION,"attrs":{"release":"PLUGIN_VERSION","environment":"production"}}]]],
    ",
      "telemetry.js": "(() => {
      // _sentry-injection-stub
      !(function() {
        try {
          var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
          e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
        } catch (e2) {
        }
      })();

      // sentry-debug-id-stub:_sentry-debug-id-injection-stub?sentry-module-id=00000000-0000-0000-0000-000000000000
      !(function() {
        try {
          var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
          var n = new e.Error().stack;
          n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "00000000-0000-0000-0000-000000000000", e._sentryDebugIdIdentifier = "sentry-dbid-00000000-0000-0000-0000-000000000000");
        } catch (e2) {
        }
      })();

      // src/basic.js
      console.log("hello world");

      // src/basic.js?sentryDebugIdProxy=true
      var basic_default = void 0;
    })();
    ",
    }
  `);

  const output = runFileInNode("telemetry.js");
  expect(output).toBe("hello world\n");
});
