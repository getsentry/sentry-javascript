import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "index.js": "!function() {
      try {
        var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
        e.SENTRY_RELEASE = { id: "I am release!" };
        var n = new e.Error().stack;
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "00000000-0000-0000-0000-000000000000", e._sentryDebugIdIdentifier = "sentry-dbid-00000000-0000-0000-0000-000000000000");
      } catch (e2) {
      }
    }();
    console.log("I am import!");
    console.log("I am index!");
    //# sourceMappingURL=index.js.map
    ",
      "index.js.map": "{"version":3,"file":"index.js","sources":["../../src/import.js","../../src/index.js"],"sourcesContent":["// eslint-disable-next-line no-console\\nconsole.log(\\"I am import!\\");\\n\\nexport {};\\n","import \\"./import\\";\\n\\n// eslint-disable-next-line no-console\\nconsole.log(\\"I am index!\\");\\n"],"names":[],"mappings":";;;;;;;;;AACA,QAAQ,IAAI,cAAc;ACE1B,QAAQ,IAAI,aAAa;"}",
    }
  `);

  const output = runFileInNode("index.js");
  expect(output).toContain("I am import!");
  expect(output).toContain("I am index!");
});
