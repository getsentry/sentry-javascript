globalThis.sloppyModePreserved =
  (function () {
    return this;
  })() === globalThis;

console.log(
  JSON.stringify({
    sloppyModePreserved: globalThis.sloppyModePreserved,
    releaseInjected: globalThis.SENTRY_RELEASE?.id === "strict-mode-release",
    debugIdInjected: Object.keys(globalThis._sentryDebugIds || {}).length === 1,
  })
);
