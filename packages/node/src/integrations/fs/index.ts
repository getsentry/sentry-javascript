import { defineIntegration } from '@sentry/core';
import { enableFsInstrumentation } from './vendored/instrumentation';
import type { FsInstrumentationConfig } from './vendored/types';

const INTEGRATION_NAME = 'FileSystem' as const;

/**
 * This integration will create spans for `fs` API operations, like reading and writing files.
 *
 * **WARNING:** This integration may add significant overhead to your application. Especially in scenarios with a lot of
 * file I/O, like for example when running a framework dev server, including this integration can massively slow down
 * your application.
 *
 * @param options Configuration for this integration.
 */
export const fsIntegration = defineIntegration((options: FsInstrumentationConfig = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // We only run this in the next tick to avoid instrumenting the `fs` module while the SDK is initializating
      // especially, at the point when this runs the Async Context Manager may not be set up yet,
      // which could lead to weird outcomes - so we wait until everything is settled before we instrument.
      setImmediate(() => enableFsInstrumentation(options));
    },
  };
});
