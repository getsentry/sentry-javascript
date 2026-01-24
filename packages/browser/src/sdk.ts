import type { Client, Integration, Options } from '@sentry/core';
import {
  conversationIdIntegration,
  dedupeIntegration,
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
import { spotlightBrowserIntegration } from './integrations/spotlight';
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
    conversationIdIntegration(),
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

  let defaultIntegrations =
    options.defaultIntegrations == null ? getDefaultIntegrations(options) : options.defaultIntegrations;

  /* rollup-include-development-only */
  if (options.spotlight) {
    if (!defaultIntegrations) {
      defaultIntegrations = [];
    }
    const args = typeof options.spotlight === 'string' ? { sidecarUrl: options.spotlight } : undefined;
    defaultIntegrations.push(spotlightBrowserIntegration(args));
  }
  /* rollup-include-development-only-end */

  const clientOptions: BrowserClientOptions = {
    ...options,
    enabled: shouldDisableBecauseIsBrowserExtenstion ? false : options.enabled,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup({
      integrations: options.integrations,
      defaultIntegrations,
    }),
    transport: options.transport || makeFetchTransport,
  };
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
