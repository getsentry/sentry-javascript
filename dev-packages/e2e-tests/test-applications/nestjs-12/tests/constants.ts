import { getRuntime } from '@sentry-internal/test-utils';

export const RUNTIME = getRuntime();

// Bun, Deno and Cloudflare init their runtime's own SDK, but
// `nestIntegration()` sets the NestJS SDK name.
export const SDK_NAME = 'sentry.javascript.nestjs';
