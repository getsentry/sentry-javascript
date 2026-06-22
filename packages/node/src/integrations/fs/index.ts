import { defineIntegration } from "@sentry/core";
import { enableFsInstrumentation } from "./vendored/instrumentation";
import type { FsInstrumentationConfig } from "./vendored/types";

const INTEGRATION_NAME = "FileSystem";

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
      enableFsInstrumentation(options);
    },
  };
});
