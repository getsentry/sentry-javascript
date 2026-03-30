import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, ctx }) => {
  if (process.platform === "win32") {
    ctx.skip("Windows Debug IDs do not match snapshots");
    return;
  }

  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "app.js": "!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"CURRENT_SHA"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="550fd31a-707a-4221-b84e-f3964d7c368b",e._sentryDebugIdIdentifier="sentry-dbid-550fd31a-707a-4221-b84e-f3964d7c368b");}catch(e){}}();
    /******/ (() => { // webpackBootstrap
    /******/ 	"use strict";

    // UNUSED EXPORTS: default

    ;// external "react/jsx-runtime"
    const jsx_runtime_namespaceObject = react/jsx-runtime;
    ;// ./src/component-a.jsx
    /* unused harmony import specifier */ var _jsx;

    function ComponentA() {
      return /*#__PURE__*/_jsx("span", {
        "data-sentry-component": "ComponentA",
        children: "Component A"
      });
    }
    ;// ./src/app.jsx
    /* unused harmony import specifier */ var app_ComponentA;
    /* unused harmony import specifier */ var _jsxs;
    /* unused harmony import specifier */ var app_jsx;


    function App() {
      return /*#__PURE__*/_jsxs("span", {
        "data-sentry-component": "App",
        children: [/*#__PURE__*/app_jsx(app_ComponentA, {}), ";"]
      });
    }
    /******/ })()
    ;",
    }
  `);
});
