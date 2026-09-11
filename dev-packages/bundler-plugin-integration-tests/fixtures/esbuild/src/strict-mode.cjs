"use strict";

globalThis.strictModePreserved =
  (function () {
    return this;
  })() === undefined;

console.log(
  JSON.stringify({
    strictModePreserved: globalThis.strictModePreserved,
    releaseInjected: globalThis.SENTRY_RELEASE?.id === "strict-mode-release",
    debugIdInjected: Object.keys(globalThis._sentryDebugIds || {}).length === 1,
  })
);
