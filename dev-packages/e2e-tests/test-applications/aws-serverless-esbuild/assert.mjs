import { assertBundlerInstrumentation } from '@sentry-internal/test-utils';

// Drives the four built bundles (plain / plugin / plain-external / plugin-external) across the
// build-time and runtime instrumentation paths. The external variants preload the runtime hook
// of `@sentry/aws-serverless` rather than `@sentry/node`, since that is the one a Lambda user has.
assertBundlerInstrumentation('graphql', { importHook: '@sentry/aws-serverless/import' });
