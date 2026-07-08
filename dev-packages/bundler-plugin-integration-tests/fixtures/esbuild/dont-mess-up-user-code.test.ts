import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "index.js": "(() => {
      // _sentry-injection-stub
      !(function() {
        try {
          var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
          e.SENTRY_RELEASE = { id: "I am release!" };
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

      // src/import.js
      console.log("I am import!");

      // src/index.js
      console.log("I am index!");

      // src/index.js?sentryDebugIdProxy=true
      var index_default = void 0;
    })();
    //# sourceMappingURL=index.js.map
    ",
      "index.js.map": "{"version":3,"sources":["../../_sentry-injection-stub","sentry-debug-id-stub:_sentry-debug-id-injection-stub?sentry-module-id=00000000-0000-0000-0000-000000000000","../../src/import.js","../../src/index.js","../../src/index.js"],"sourcesContent":["!function(){try{var e=\\"undefined\\"!=typeof window?window:\\"undefined\\"!=typeof global?global:\\"undefined\\"!=typeof globalThis?globalThis:\\"undefined\\"!=typeof self?self:{};e.SENTRY_RELEASE={id:\\"I am release!\\"};}catch(e){}}();","!function(){try{var e=\\"undefined\\"!=typeof window?window:\\"undefined\\"!=typeof global?global:\\"undefined\\"!=typeof globalThis?globalThis:\\"undefined\\"!=typeof self?self:{};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]=\\"00000000-0000-0000-0000-000000000000\\",e._sentryDebugIdIdentifier=\\"sentry-dbid-00000000-0000-0000-0000-000000000000\\");}catch(e){}}();","// eslint-disable-next-line no-console\\nconsole.log(\\"I am import!\\");\\n\\nexport {};\\n","import \\"./import\\";\\n\\n// eslint-disable-next-line no-console\\nconsole.log(\\"I am index!\\");\\n","\\n              import \\"_sentry-debug-id-injection-stub\\";\\n              import * as OriginalModule from \\"./src/index.js\\";\\n              export default OriginalModule.default;\\n              export * from \\"./src/index.js\\";"],"mappings":";;AAAA,IAAC,WAAU;AAAC,QAAG;AAAC,UAAI,IAAE,eAAa,OAAO,SAAO,SAAO,eAAa,OAAO,SAAO,SAAO,eAAa,OAAO,aAAW,aAAW,eAAa,OAAO,OAAK,OAAK,CAAC;AAAE,QAAE,iBAAe,EAAC,IAAG,gBAAe;AAAA,IAAE,SAAOA,IAAE;AAAA,IAAC;AAAA,EAAC,GAAE;;;ACAxN,IAAC,WAAU;AAAC,QAAG;AAAC,UAAI,IAAE,eAAa,OAAO,SAAO,SAAO,eAAa,OAAO,SAAO,SAAO,eAAa,OAAO,aAAW,aAAW,eAAa,OAAO,OAAK,OAAK,CAAC;AAAE,UAAI,IAAG,IAAI,EAAE,QAAO;AAAM,YAAI,EAAE,kBAAgB,EAAE,mBAAiB,CAAC,GAAE,EAAE,gBAAgB,CAAC,IAAE,wCAAuC,EAAE,2BAAyB;AAAA,IAAoD,SAAOC,IAAE;AAAA,IAAC;AAAA,EAAC,GAAE;;;ACCnY,UAAQ,IAAI,cAAc;;;ACE1B,UAAQ,IAAI,aAAa;;;ACAX,MAAO,gBAAuB;","names":["e","e"]}",
    }
  `);

  const output = runFileInNode("index.js");
  expect(output).toContain("I am import!");
  expect(output).toContain("I am index!");
});
