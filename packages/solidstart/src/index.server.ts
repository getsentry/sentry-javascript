import { withSentry as _withSentry } from './config';

export * from './server';

/**
 * @deprecated Import `withSentry` from `@sentry/solidstart/vite` instead.
 * This export will be removed in the next major version.
 */
export const withSentry = _withSentry;
