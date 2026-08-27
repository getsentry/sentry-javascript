import type { BuildTimeOptionsBase } from '@sentry/core';
import type { RouteData } from 'astro';

type SdkInitPaths = {
  /**
   * Path to a `sentry.client.config.(js|ts)` file that contains a `Sentry.init` call.
   *
   * If this option is not specified, the default location (`<projectRoot>/sentry.client.config.(js|ts)`)
   * will be used to look up the config file.
   * If there is no file at the default location either, the SDK will initialize with default options.
   */
  clientInitPath?: string;

  /**
   * Path to a `sentry.server.config.(js|ts)` file that contains a `Sentry.init` call.
   *
   * If this option is not specified, the default location (`<projectRoot>/sentry.server.config.(js|ts)`)
   * will be used to look up the config file.
   * If there is no file at the default location either, the SDK will initialize with default options.
   */
  serverInitPath?: string;
};

type InstrumentationOptions = {
  /**
   * Options for automatic instrumentation of your application.
   */
  autoInstrumentation?: {
    /**
     * If this flag is `true` and your application is configured for SSR (or hybrid) mode,
     * the Sentry integration will automatically add middleware to:
     *
     * - capture server performance data and spans for incoming server requests
     * - enable distributed tracing between server and client
     * - annotate server errors with more information
     *
     * @default true in SSR/hybrid mode, false in SSG/static mode
     */
    requestHandler?: boolean;
  };
};

type SdkEnabledOptions = {
  /**
   * Controls if the Sentry SDK is enabled or not.
   *
   * You can either set a boolean value to enable/disable the SDK for both client and server,
   * or pass an object with `client` and `server` properties to enable/disable the SDK.
   *
   * If the SDK is disabled, no data will be caught or sent to Sentry. In this case, also no
   * Sentry code will be added to your bundle.
   *
   * @default true - the SDK is enabled by default for both, client and server.
   *
   */
  enabled?:
    | boolean
    | {
        client?: boolean;
        server?: boolean;
      };
};

/**
 * Options for the `sentryAstro` integration.
 *
 * Build-time options (source maps, release management, etc.) are configured here.
 * Runtime SDK options must be set in `sentry.client.config.(js|ts)` or `sentry.server.config.(js|ts)`.
 *
 * If you specify a dedicated init file, the SDK options passed to `sentryAstro` will be ignored for init.
 */
export type SentryOptions = BuildTimeOptionsBase & SdkInitPaths & InstrumentationOptions & SdkEnabledOptions;

/**
 * Routes inside 'astro:routes:resolved' hook (Astro v5+)
 *
 * Inline type for official `IntegrationResolvedRoute`.
 * The type includes more properties, but we only need some of them.
 *
 * @see https://github.com/withastro/astro/blob/04e60119afee668264a2ff6665c19a32150f4c91/packages/astro/src/types/public/integrations.ts#L287
 */
export type IntegrationResolvedRoute = {
  isPrerendered: RouteData['prerender'];
  pattern: RouteData['route'];
  patternRegex: RouteData['pattern'];
  segments: RouteData['segments'];
};

/**
 * Internal type for Astro routes, as we store an additional `patternCaseSensitive` property alongside the
 * lowercased parametrized `pattern` of each Astro route.
 */
export type ResolvedRouteWithCasedPattern = IntegrationResolvedRoute & {
  patternRegex: string; // RegEx gets stringified
  patternCaseSensitive: string;
};
