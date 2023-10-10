import type { BrowserOptions } from '@sentry/browser';
import type { Options } from '@sentry/types';
import type { SentryVitePluginOptions } from '@sentry/vite-plugin';

type SdkInitPaths = {
  /**
   * Path to a `sentry.client.config.(js|ts)` file that contains a `Sentry.init` call.
   * If this option is not specified, the default location (`src/sentry.client.config.(js|ts)`) will be used.
   * If there is no file at the default location, a default `Sentry.init` call will made.
   */
  clientInitPath?: string;
  /**
   * Path to a `sentry.client.config.(js|ts)` file that contains a `Sentry.init` call.
   * If this option is not specified, the default location (`src/sentry.client.config.(js|ts)`) will be used.
   * If there is no file at the default location, a default `Sentry.init` call will made.
   */
  serverInitPath?: string;
};

/**
 * A subset of Sentry SDK options that can be set via the `sentryAstro` integration.
 * Some options (e.g. integrations) are set by default and cannot be changed here.
 *
 * If you want a more fine-grained control over the SDK, with all options,
 * you can call Sentry.init in `sentry.client.config.(js|ts)` or `sentry.server.config.(js|ts)` files.
 *
 * If you specify a dedicated init file, the SDK options passed to `sentryAstro` will be ignored.
 */
export type SentryOptions = SdkInitPaths &
  Pick<Options, 'dsn' | 'release' | 'environment' | 'sampleRate' | 'tracesSampleRate' | 'debug'> &
  Pick<BrowserOptions, 'replaysSessionSampleRate' | 'replaysOnErrorSampleRate'> &
  Pick<SentryVitePluginOptions, 'authToken' | 'org' | 'project' | 'telemetry'>;
