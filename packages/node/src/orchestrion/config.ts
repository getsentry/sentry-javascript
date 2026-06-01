// Re-export of the shared orchestrion instrumentation config. The single source
// of truth lives in `@sentry-internal/server-utils`; this file preserves the
// `@sentry/node/orchestrion/config` subpath that the runtime hook resolves.
export { SENTRY_INSTRUMENTATIONS } from '@sentry-internal/server-utils/orchestrion/config';
