import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "bundle.js": "!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"CURRENT_SHA"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="1ddfd748-f716-49b5-a6bb-a08a480112e2",e._sentryDebugIdIdentifier="sentry-dbid-1ddfd748-f716-49b5-a6bb-a08a480112e2");}catch(e){}}();
    /******/ (() => { // webpackBootstrap
    /******/ 	"use strict";
    console.log(
      JSON.stringify({
        debug:  false ? 0 : "b",
        trace:  false ? 0 : "b",
        replayCanvas:  true ? "a" : 0,
        replayIframe:  true ? "a" : 0,
        replayShadowDom:  true ? "a" : 0,
        replayWorker:  true ? "a" : 0,
      })
    );

    /******/ })()
    ;",
    }
  `);

  const output = runFileInNode("bundle.js");
  expect(output).toMatchInlineSnapshot(`
    "{"debug":"b","trace":"b","replayCanvas":"a","replayIframe":"a","replayShadowDom":"a","replayWorker":"a"}
    "
  `);
});
