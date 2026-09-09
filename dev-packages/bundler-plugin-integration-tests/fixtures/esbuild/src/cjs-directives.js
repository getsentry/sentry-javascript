import "./strict-mode.cjs";
import "./sloppy-mode.cjs";

console.log(
  JSON.stringify({
    strictModePreserved: globalThis.strictModePreserved,
    sloppyModePreserved: globalThis.sloppyModePreserved,
    releaseInjected: globalThis.SENTRY_RELEASE?.id === "strict-mode-release",
    debugIdInjected: Object.keys(globalThis._sentryDebugIds || {}).length === 1,
  })
);
