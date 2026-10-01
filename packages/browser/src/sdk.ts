import type { Client, Integration, Options } from '@sentry/core';
import {
  consoleIntegration,
  conversationIdIntegration,
  debug,
  dedupeIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  getIntegrationsToSetup,
  initAndBind,
  Scope,
  setNormalizeStringifier,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import type { BrowserClientOptions, BrowserOptions } from './client';
import { BrowserClient } from './client';
import { breadcrumbsIntegration } from './integrations/breadcrumbs';
import { browserApiErrorsIntegration } from './integrations/browserapierrors';
import { browserSessionIntegration } from './integrations/browsersession';
import { cultureContextIntegration } from './integrations/culturecontext';
import { globalHandlersIntegration } from './integrations/globalhandlers';
import { httpContextIntegration } from './integrations/httpcontext';
import { linkedErrorsIntegration } from './integrations/linkederrors';
import { spotlightBrowserIntegration } from './integrations/spotlight';
import { defaultStackParser } from './stack-parsers';
import { makeFetchTransport } from './transports/fetch';
import { normalizeStringifyValue } from './normalizeStringifyValue';
import { checkAndWarnIfIsEmbeddedBrowserExtension } from './utils/detectBrowserExtension';

/** Get the default integrations for the browser SDK. */
export function getDefaultIntegrations(_options: Options): Integration[] {
  /**
   * Note: Please make sure this stays in sync with Angular SDK, which re-exports
   * `getDefaultIntegrations` but with an adjusted set of integrations.
   */
  return [
    eventFiltersIntegration(),
    functionToStringIntegration(),
    conversationIdIntegration(),
    browserApiErrorsIntegration(),
    breadcrumbsIntegration(),
    consoleIntegration(),
    globalHandlersIntegration(),
    linkedErrorsIntegration(),
    dedupeIntegration(),
    httpContextIntegration(),
    cultureContextIntegration(),
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

  /*! rollup-include-development-only */
  if (options.spotlight) {
    if (!defaultIntegrations) {
      defaultIntegrations = [];
    }
    const args = typeof options.spotlight === 'string' ? { sidecarUrl: options.spotlight } : undefined;
    defaultIntegrations.push(spotlightBrowserIntegration(args));
  }
  /*! rollup-include-development-only-end */

  const integrations = getIntegrationsToSetup({
    integrations: options.integrations,
    defaultIntegrations,
  });

  const clientOptions: BrowserClientOptions = {
    ...options,
    enabled: shouldDisableBecauseIsBrowserExtenstion ? false : options.enabled,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations,
    transport: options.transport || makeFetchTransport,
  };

  setNormalizeStringifier(normalizeStringifyValue);

  return initAndBind(BrowserClient, clientOptions);
}

/**
 * The default integrations of {@link init} that do not depend on the SDK's global state. The others (GlobalHandlers,
 * Breadcrumbs, BrowserApiErrors, BrowserSession, Console, ConversationId, FunctionToString) only work for the
 * current client, so referencing them here would only add bundle size.
 */
function getDefaultStandaloneIntegrations(): Integration[] {
  return [
    eventFiltersIntegration(),
    linkedErrorsIntegration(),
    dedupeIntegration(),
    httpContextIntegration(),
    cultureContextIntegration(),
  ];
}

export interface StandaloneClient {
  client: BrowserClient;
  /** A scope bound to the client. Capture through it, or pass it to the APIs that accept a scope. */
  scope: Scope;
}

/**
 * Creates a client that is detached from the SDK's global state, for code that runs next to another Sentry SDK on
 * the same page: libraries, widgets, plugins and browser extensions.
 *
 * Unlike {@link init}, this does not make the client the current client, so `Sentry.captureException` and the other
 * global functions keep going to whatever the host page set up. Capture through the returned scope instead. Data
 * from the host's scopes (user, tags, breadcrumbs) is never applied to this client's events.
 *
 * Only the default integrations that do not depend on global state are installed, so errors are not captured
 * automatically.
 *
 * @example
 * ```
 * import { createStandaloneClient } from '@sentry/browser';
 *
 * const { scope } = createStandaloneClient({ dsn: '__DSN__' });
 *
 * try {
 *   doSomething();
 * } catch (error) {
 *   scope.captureException(error);
 * }
 * ```
 */
export function createStandaloneClient(options: BrowserOptions = {}): StandaloneClient {
  if (DEBUG_BUILD && options.debug) {
    debug.enable();
  }

  const defaultIntegrations =
    options.defaultIntegrations ?? getDefaultStandaloneIntegrations();

  const clientOptions: BrowserClientOptions = {
    ...options,
    standalone: true,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup({ integrations: options.integrations, defaultIntegrations }),
    transport: options.transport || makeFetchTransport,
  };

  setNormalizeStringifier(normalizeStringifyValue);

  const client = new BrowserClient(clientOptions);
  const scope = new Scope();
  scope.setClient(client);
  client.init();

  return { client, scope };
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
