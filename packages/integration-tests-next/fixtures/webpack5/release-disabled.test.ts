import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "basic.js": "!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"CURRENT_SHA"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="6438758c-c236-4f8b-af24-575a5948a617",e._sentryDebugIdIdentifier="sentry-dbid-6438758c-c236-4f8b-af24-575a5948a617");}catch(e){}}();
    /******/ (() => { // webpackBootstrap
    /******/ 	"use strict";
    // eslint-disable-next-line no-console
    console.log("hello world");

    /******/ })()
    ;",
      "sentry-cli-mock.json": "["releases","set-commits","CURRENT_SHA","--auto","--ignore-missing"],
    ["releases","finalize","CURRENT_SHA"],
    ["sourcemaps","upload","-p","fake-project","--release","CURRENT_SHA","sentry-bundler-plugin-upload-path","--ignore","node_modules","--no-rewrite"],
    ",
    }
  `);
});
