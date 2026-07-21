import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "basic.js": "!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"build-information-injection-test"};e.SENTRY_BUILD_INFO={"deps":["@babel/preset-react","@sentry/bundler-plugins","babel-loader","webpack","webpack-cli"],"depsVersions":{"webpack":5},"nodeVersion":"NODE_VERSION"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="00000000-0000-0000-0000-000000000000",e._sentryDebugIdIdentifier="sentry-dbid-00000000-0000-0000-0000-000000000000");}catch(e){}}();
    /******/ (() => { // webpackBootstrap
    /******/ 	"use strict";
    // eslint-disable-next-line no-console
    console.log("hello world");

    /******/ })()
    ;",
    }
  `);
});
