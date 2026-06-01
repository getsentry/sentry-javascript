// Re-export of the shared orchestrion Vite plugin. The implementation lives in
// `@sentry/server-utils`; this file preserves the
// `@sentry/node/orchestrion/vite` subpath export. ESM-only, matching the
// upstream `@apm-js-collab/code-transformer-bundler-plugins` package.
export { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
