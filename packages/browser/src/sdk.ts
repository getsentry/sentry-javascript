import type { Client, Integration, Options } from '@sentry/core';
import {
  dedupeIntegration,
  envToBool,
  functionToStringIntegration,
  getIntegrationsToSetup,
  inboundFiltersIntegration,
  initAndBind,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import type { BrowserClientOptions, BrowserOptions } from './client';
import { BrowserClient } from './client';
import { breadcrumbsIntegration } from './integrations/breadcrumbs';
import { browserApiErrorsIntegration } from './integrations/browserapierrors';
import { browserSessionIntegration } from './integrations/browsersession';
import { globalHandlersIntegration } from './integrations/globalhandlers';
import { httpContextIntegration } from './integrations/httpcontext';
import { linkedErrorsIntegration } from './integrations/linkederrors';
import { INTEGRATION_NAME as SPOTLIGHT_INTEGRATION_NAME, spotlightBrowserIntegration } from './integrations/spotlight';
import { defaultStackParser } from './stack-parsers';
import { makeFetchTransport } from './transports/fetch';
import { checkAndWarnIfIsEmbeddedBrowserExtension } from './utils/detectBrowserExtension';

/** Get the default integrations for the browser SDK. */
export function getDefaultIntegrations(_options: Options): Integration[] {
  /**
   * Note: Please make sure this stays in sync with Angular SDK, which re-exports
   * `getDefaultIntegrations` but with an adjusted set of integrations.
   */
  return [
    // TODO(v11): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
    // eslint-disable-next-line deprecation/deprecation
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    browserApiErrorsIntegration(),
    breadcrumbsIntegration(),
    globalHandlersIntegration(),
    linkedErrorsIntegration(),
    dedupeIntegration(),
    httpContextIntegration(),
    browserSessionIntegration(),
  ];
}

/**
 * The Sentry Browser SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible when
 * loading the web page. To set context information or send manual events, use
 * the provided methods.
 *
 * @example
 *
 * ```
 *
 * import { init } from '@sentry/browser';
 *
 * init({
 *   dsn: '__DSN__',
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 *
 * import { addBreadcrumb } from '@sentry/browser';
 * addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 * ```
 *
 * @example
 *
 * ```
 *
 * import * as Sentry from '@sentry/browser';
 * Sentry.captureMessage('Hello, world!');
 * Sentry.captureException(new Error('Good bye'));
 * Sentry.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * });
 * ```
 *
 * @see {@link BrowserOptions} for documentation on configuration options.
 */
export function init(options: BrowserOptions = {}): Client | undefined {
  const shouldDisableBecauseIsBrowserExtenstion =
    !options.skipBrowserExtensionCheck && checkAndWarnIfIsEmbeddedBrowserExtension();

  // Read spotlight config from env var with graceful fallback
  // This will be replaced at build time by bundlers like webpack/vite
  let spotlightFromEnv: boolean | string | undefined;
  if (typeof process !== 'undefined' && process.env && process.env.SENTRY_SPOTLIGHT !== undefined) {
    const envValue = process.env.SENTRY_SPOTLIGHT;
    const parsedEnvValue = envToBool(envValue, { strict: true });
    spotlightFromEnv = parsedEnvValue ?? envValue;
  }

  const spotlight = options.spotlight ?? spotlightFromEnv;

  const clientOptions: BrowserClientOptions = {
    ...options,
    enabled: shouldDisableBecauseIsBrowserExtenstion ? false : options.enabled,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup({
      integrations: options.integrations,
      defaultIntegrations:
        options.defaultIntegrations == null ? getDefaultIntegrations(options) : options.defaultIntegrations,
    }),
    transport: options.transport || makeFetchTransport,
    spotlight,
  };

  // Auto-add spotlight integration if enabled and not already present
  if (spotlight && !clientOptions.integrations.some(({ name }) => name === SPOTLIGHT_INTEGRATION_NAME)) {
    clientOptions.integrations.push(
      spotlightBrowserIntegration({
        sidecarUrl: typeof spotlight === 'string' ? spotlight : undefined,
      }),
    );
  }

  return initAndBind(BrowserClient, clientOptions);
}

/**
 * This function is here to be API compatible with the loader.
 * @hidden
 */
export function forceLoad(): void {
  // Noop
}

/**
 * This function is here to be API compatible with the loader.
 * @hidden
 */
export function onLoad(callback: () => void): void {
  callback();
}
