import { GLOBAL_OBJ } from '@sentry/core';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryBasePath?: string;
};

/**
 * The app's `basePath`, which `withSentryConfig` injects. The client bundle reads it from `env`. On the server,
 * `@sentry/nextjs` is external, so `env` isn't inlined there and it reads the injected global instead.
 */
export function getInjectedBasePath(): string | undefined {
  return process.env._sentryBasePath || globalWithInjectedValues._sentryBasePath;
}
