import { defineIntegration } from '@sentry/core';

/**
 * Shim for the edge build so named imports from `@sentry/nextjs` stay resolvable in
 * edge-compiled instrumentation modules. The real, Node-only implementation ships in the server build.
 *
 * See: https://github.com/getsentry/sentry-javascript/issues/21317
 */
const _pinoIntegration = defineIntegration(() => {
  return {
    name: 'Pino',
  };
});

export const pinoIntegration = Object.assign(_pinoIntegration, {
  trackLogger(_logger: unknown): void {
    // no-op outside of Node
  },
  untrackLogger(_logger: unknown): void {
    // no-op outside of Node
  },
});
