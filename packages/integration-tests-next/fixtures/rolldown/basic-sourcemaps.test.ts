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

    //# sourceMappingURL=basic.js.map",
      "basic.js.map": "{"version":3,"file":"basic.js","names":[],"sources":["../../src/basic.js"],"sourcesContent":["// eslint-disable-next-line no-console\\nconsole.log(\\"hello world\\");\\n"],"mappings":";;;;;;;;;AACA,QAAQ,IAAI,cAAc"}",
      "sentry-cli-mock.json": "["releases","new","CURRENT_SHA"],
    ["releases","set-commits","CURRENT_SHA","--auto","--ignore-missing"],
    ["releases","finalize","CURRENT_SHA"],
    ["sourcemaps","upload","-p","fake-project","--release","CURRENT_SHA","sentry-bundler-plugin-upload-path","--ignore","node_modules","--no-rewrite"],
    ",
    }
  `);

  const output = runFileInNode("basic.js");
  expect(output).toBe("hello world\n");
});
