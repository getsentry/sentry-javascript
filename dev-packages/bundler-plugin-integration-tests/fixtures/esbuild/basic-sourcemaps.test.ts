import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "basic-sourcemaps.js": "(() => {
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
    //# sourceMappingURL=basic-sourcemaps.js.map
    ",
      "basic-sourcemaps.js.map": "{"version":3,"sources":["../../_sentry-injection-stub","sentry-debug-id-stub:_sentry-debug-id-injection-stub?sentry-module-id=00000000-0000-0000-0000-000000000000","../../src/basic.js","../../src/basic.js"],"sourcesContent":["!function(){try{var e=\\"undefined\\"!=typeof window?window:\\"undefined\\"!=typeof global?global:\\"undefined\\"!=typeof globalThis?globalThis:\\"undefined\\"!=typeof self?self:{};e.SENTRY_RELEASE={id:\\"CURRENT_SHA\\"};}catch(e){}}();","!function(){try{var e=\\"undefined\\"!=typeof window?window:\\"undefined\\"!=typeof global?global:\\"undefined\\"!=typeof globalThis?globalThis:\\"undefined\\"!=typeof self?self:{};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]=\\"00000000-0000-0000-0000-000000000000\\",e._sentryDebugIdIdentifier=\\"sentry-dbid-00000000-0000-0000-0000-000000000000\\");}catch(e){}}();","// eslint-disable-next-line no-console\\nconsole.log(\\"hello world\\");\\n","\\n              import \\"_sentry-debug-id-injection-stub\\";\\n              import * as OriginalModule from \\"./src/basic.js\\";\\n              export default OriginalModule.default;\\n              export * from \\"./src/basic.js\\";"],"mappings":";;AAAA,IAAC,WAAU;AAAC,QAAG;AAAC,UAAI,IAAE,eAAa,OAAO,SAAO,SAAO,eAAa,OAAO,SAAO,SAAO,eAAa,OAAO,aAAW,aAAW,eAAa,OAAO,OAAK,OAAK,CAAC;AAAE,QAAE,iBAAe,EAAC,IAAG,2CAA0C;AAAA,IAAE,SAAOA,IAAE;AAAA,IAAC;AAAA,EAAC,GAAE;;;ACAnP,IAAC,WAAU;AAAC,QAAG;AAAC,UAAI,IAAE,eAAa,OAAO,SAAO,SAAO,eAAa,OAAO,SAAO,SAAO,eAAa,OAAO,aAAW,aAAW,eAAa,OAAO,OAAK,OAAK,CAAC;AAAE,UAAI,IAAG,IAAI,EAAE,QAAO;AAAM,YAAI,EAAE,kBAAgB,EAAE,mBAAiB,CAAC,GAAE,EAAE,gBAAgB,CAAC,IAAE,wCAAuC,EAAE,2BAAyB;AAAA,IAAoD,SAAOC,IAAE;AAAA,IAAC;AAAA,EAAC,GAAE;;;ACCnY,UAAQ,IAAI,aAAa;;;ACEX,MAAO,gBAAuB;","names":["e","e"]}",
      "sentry-cli-mock.json": "["releases","new","CURRENT_SHA"],
    ["releases","set-commits","CURRENT_SHA","--auto","--ignore-missing"],
    ["releases","finalize","CURRENT_SHA"],
    ["sourcemaps","upload","-p","fake-project","--release","CURRENT_SHA","sentry-bundler-plugin-upload-path","--ignore","node_modules","--no-rewrite"],
    ",
    }
  `);

  const output = runFileInNode("basic-sourcemaps.js");
  expect(output).toBe("hello world\n");
});
