// Stands in for the `debug` package in the vendored dependencies (see `rollup.npm.config.mjs`).
// `debug` reads `process.env` when it loads, which throws on Deno without env permission, and the
// Deno SDK loads this package from `init()`. The messages go to the Sentry logger instead, so
// `debug: true` turns them on.
import { debug } from '@sentry/core';
import { format } from 'node:util';

export default function createDebug(namespace: string): (...args: unknown[]) => void {
  return (...args) => {
    if (debug.isEnabled()) {
      debug.log(`[${namespace}]`, format(...args));
    }
  };
}
