// Polyfill for Node.js perf_hooks module in edge runtime
// This mirrors the polyfill from packages/vercel-edge/rollup.npm.config.mjs

// Ensure performance global is available
if (typeof globalThis !== 'undefined' && globalThis.performance === undefined) {
  globalThis.performance = {
    timeOrigin: 0,
    now: function () {
      return Date.now();
    },
  };
}

// Export the performance object for perf_hooks compatibility
export const performance = globalThis.performance || {
  timeOrigin: 0,
  now: function () {
    return Date.now();
  },
};

// Default export for CommonJS compatibility
export default {
  performance,
};
