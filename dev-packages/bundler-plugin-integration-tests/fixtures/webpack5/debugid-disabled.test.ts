import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "basic.js": "/******/ (() => { // webpackBootstrap
    /******/ 	"use strict";
    // eslint-disable-next-line no-console
    console.log("hello world");

    /******/ })()
    ;
    //# sourceMappingURL=basic.js.map",
      "basic.js.map": "{"version":3,"file":"basic.js","mappings":";;AAAA;AACA","sources":["webpack://webpack5-integration-tests/./src/basic.js"],"sourcesContent":["// eslint-disable-next-line no-console\\nconsole.log(\\"hello world\\");\\n"],"names":[],"sourceRoot":""}",
    }
  `);
});
