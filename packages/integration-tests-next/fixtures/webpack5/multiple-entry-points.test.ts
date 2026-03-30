import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "entry1.js": "!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="a50aee12-d2d3-4d16-88bd-652f76f59160",e._sentryDebugIdIdentifier="sentry-dbid-a50aee12-d2d3-4d16-88bd-652f76f59160");}catch(e){}}();
    /******/ (() => { // webpackBootstrap
    /******/ 	"use strict";

    ;// ./src/common.js
    function add(a, b) {
      return a + b;
    }

    ;// ./src/entry1.js


    console.log(add(1, 2));

    /******/ })()
    ;",
      "entry2.js": "!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="ca296a6b-7e8f-4158-a4c6-725f2e93e232",e._sentryDebugIdIdentifier="sentry-dbid-ca296a6b-7e8f-4158-a4c6-725f2e93e232");}catch(e){}}();
    /******/ (() => { // webpackBootstrap
    /******/ 	"use strict";

    ;// ./src/common.js
    function add(a, b) {
      return a + b;
    }

    ;// ./src/entry2.js


    console.log(add(2, 4));

    /******/ })()
    ;",
    }
  `);

  const output1 = runFileInNode("entry1.js");
  expect(output1).toMatchInlineSnapshot(`
    "3
    "
  `);
  const output2 = runFileInNode("entry2.js");
  expect(output2).toMatchInlineSnapshot(`
    "6
    "
  `);
});
