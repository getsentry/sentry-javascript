import { expect } from "vitest";
import { readAllFiles } from "../utils";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, createTempDir }) => {
  const tempDir = createTempDir();

  runBundler({ SENTRY_TEST_OVERRIDE_TEMP_DIR: tempDir });
  const files = readAllFiles(tempDir);
  expect(files).toMatchInlineSnapshot(`
    {
      "79e26bd8-4927-4a42-b909-053245d3f7b3-0.js": "//#region src/basic.js
    (function() {
    	try {
    		var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
    		e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
    		var n = new e.Error().stack;
    		n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "00000000-0000-0000-0000-000000000000", e._sentryDebugIdIdentifier = "sentry-dbid-00000000-0000-0000-0000-000000000000");
    	} catch (e) {}
    })();
    console.log("hello world");
    //#endregion

    //# debugId=00000000-0000-0000-0000-000000000000
    //# sourceMappingURL=basic.js.map",
      "79e26bd8-4927-4a42-b909-053245d3f7b3-0.js.map": "{"version":3,"file":"basic.js","names":[],"sources":["../../src/basic.js"],"sourcesContent":["// eslint-disable-next-line no-console\\nconsole.log(\\"hello world\\");\\n"],"mappings":";;;;;;;;;AACA,QAAQ,IAAI,cAAc","debugId":"79e26bd8-4927-4a42-b909-053245d3f7b3","debug_id":"79e26bd8-4927-4a42-b909-053245d3f7b3"}",
    }
  `);
});
