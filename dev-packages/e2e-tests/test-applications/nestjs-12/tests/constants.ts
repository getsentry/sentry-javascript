import { getRuntime } from '@sentry-internal/test-utils';

export const RUNTIME = getRuntime();

// Only Node inits `@sentry/nestjs`. Bun, Deno and Cloudflare init their runtime's own SDK.
export const SDK_NAME = RUNTIME === 'node' ? 'sentry.javascript.nestjs' : `sentry.javascript.${RUNTIME}`;
