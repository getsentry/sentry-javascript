import { assertBundlerInstrumentation } from '@sentry-internal/test-utils';

// Drives the four built bundles (plain / plugin / plain-external / plugin-external) across the
// build-time and runtime instrumentation paths and asserts exactly one set of graphql spans in each
// instrumented scenario, plus the inlined-vs-external bundle shape. See `assertBundlerInstrumentation`
// in `@sentry-internal/test-utils` for the full matrix.
assertBundlerInstrumentation('graphql');
