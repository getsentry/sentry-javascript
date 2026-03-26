import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "basic.js": "//#region src/basic.js
    !function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"build-information-injection-test"};e.SENTRY_BUILD_INFO={"deps":["@sentry/rollup-plugin","react","rolldown"],"depsVersions":{"react":19},"nodeVersion":"NODE_VERSION"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="b699d9c1-b033-4536-aa25-233c92609b54",e._sentryDebugIdIdentifier="sentry-dbid-b699d9c1-b033-4536-aa25-233c92609b54");}catch(e){}}();console.log("hello world");

    //#endregion",
    }
  `);
});
