import { init } from './sdk';

/**
 * The @sentry/node/init export can be used with the node --import and --require args to initialize the SDK entirely via
 * environment variables.
 *
 * > SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 SENTRY_TRACES_SAMPLE_RATE=1.0 node --import=@sentry/node/init app.mjs
 */
init();
