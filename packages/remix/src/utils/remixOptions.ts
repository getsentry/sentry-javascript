import type { NodeOptions } from '@sentry/node';
import type { BrowserOptions } from '@sentry/react';
import type { Options } from '@sentry/types';

export type RemixOptions = (Options | BrowserOptions | NodeOptions) & {
  captureActionFormDataKeys?: Record<string, string | boolean>;
} & (
    | {
        /**
         * Enables OpenTelemetry Remix instrumentation.
         *
         * Note: This option will be the default behavior and will be removed in the next major version.
         */
        autoInstrumentRemix?: true;
      }
    | {
        /**
         * Enables OpenTelemetry Remix instrumentation
         *
         * @deprecated Setting this option to `false` is deprecated as the next major version will default to behaving as if this option were `true` and the option itself will be removed.
         * It is recommended to set this option to `true`.
         */
        autoInstrumentRemix?: false;
      }
  );
