import { expect } from "vitest";
import { readAllFiles } from "../utils";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, createTempDir }) => {
  const tempDir = createTempDir();

  runBundler({ SENTRY_TEST_OVERRIDE_TEMP_DIR: tempDir });
  const files = readAllFiles(tempDir);
  expect(files).toMatchInlineSnapshot(`
    {
      "33730b8e-5b8d-4795-94b2-666cea28fce6-0.js": "!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"CURRENT_SHA"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="00000000-0000-0000-0000-000000000000",e._sentryDebugIdIdentifier="sentry-dbid-00000000-0000-0000-0000-000000000000");}catch(e){}}();
    /******/ (() => { // webpackBootstrap
    /******/ 	"use strict";
    // eslint-disable-next-line no-console
    console.log("hello world");

    /******/ })()
    ;
    //# sourceMappingURL=basic.js.map
    //# debugId=00000000-0000-0000-0000-000000000000",
      "33730b8e-5b8d-4795-94b2-666cea28fce6-0.js.map": "{"version":3,"file":"basic.js","mappings":";;;AAAA;AACA","sources":["webpack5-integration-tests/./src/basic.js"],"sourcesContent":["// eslint-disable-next-line no-console\\nconsole.log(\\"hello world\\");\\n"],"names":[],"sourceRoot":"","debug_id":"33730b8e-5b8d-4795-94b2-666cea28fce6","debugId":"33730b8e-5b8d-4795-94b2-666cea28fce6"}",
    }
  `);
});
