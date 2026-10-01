import { expect } from "vitest";
import { readAllFiles } from "../utils";
import { test } from "./utils";

const normalizeDebugIds = (value: string): string =>
  value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "00000000-0000-0000-0000-000000000000");

test(import.meta.url, ({ runBundler, createTempDir }) => {
  const tempDir = createTempDir();

  runBundler({ SENTRY_TEST_OVERRIDE_TEMP_DIR: tempDir });
  // Rolldown debug IDs are derived from the final chunk text, so they change with every Rolldown
  // release. Zero them in file names and source maps to keep the snapshot stable.
  const files = Object.fromEntries(
    Object.entries(readAllFiles(tempDir, normalizeDebugIds)).map(([name, content]) => [
      normalizeDebugIds(name),
      content,
    ])
  );
  expect(files).toMatchInlineSnapshot(`
    {
      "00000000-0000-0000-0000-000000000000-0.js": "//#region src/basic.js
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
      "00000000-0000-0000-0000-000000000000-0.js.map": "{"version":3,"file":"basic.js","names":[],"sources":["../../src/basic.js"],"sourcesContent":["// eslint-disable-next-line no-console\\nconsole.log(\\"hello world\\");\\n"],"mappings":";;;;;;;;;AACA,QAAQ,IAAI,cAAc","debugId":"00000000-0000-0000-0000-000000000000","debug_id":"00000000-0000-0000-0000-000000000000"}",
    }
  `);
});
