import type { Client, Integration, Options } from '@sentry/core';
import {
  consoleSandbox,
  dedupeIntegration,
  functionToStringIntegration,
  getIntegrationsToSetup,
  getLocationHref,
  inboundFiltersIntegration,
  initAndBind,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import type { BrowserClientOptions, BrowserOptions } from './client';
import { BrowserClient } from './client';
import { DEBUG_BUILD } from './debug-build';
import { WINDOW } from './helpers';
import { breadcrumbsIntegration } from './integrations/breadcrumbs';
import { browserApiErrorsIntegration } from './integrations/browserapierrors';
import { browserSessionIntegration } from './integrations/browsersession';
import { globalHandlersIntegration } from './integrations/globalhandlers';
import { httpContextIntegration } from './integrations/httpcontext';
import { linkedErrorsIntegration } from './integrations/linkederrors';
import { defaultStackParser } from './stack-parsers';
import { makeFetchTransport } from './transports/fetch';

type ExtensionProperties = {
  chrome?: Runtime;
  browser?: Runtime;
  nw?: unknown;
};
type Runtime = {
  runtime?: {
    id?: string;
  };
};

/**
 * A magic string that build tooling can leverage in order to inject a release value into the SDK.
 */
declare const __SENTRY_RELEASE__: string | undefined;

/** Get the default integrations for the browser SDK. */
export function getDefaultIntegrations(_options: Options): Integration[] {
  /**
   * Note: Please make sure this stays in sync with Angular SDK, which re-exports
   * `getDefaultIntegrations` but with an adjusted set of integrations.
   */
  return [
    // TODO(v10): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
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

/** Exported only for tests. */
export function applyDefaultOptions(optionsArg: BrowserOptions = {}): BrowserOptions {
  const defaultOptions: BrowserOptions = {
    defaultIntegrations: getDefaultIntegrations(optionsArg),
    release:
      typeof __SENTRY_RELEASE__ === 'string' // This allows build tooling to find-and-replace __SENTRY_RELEASE__ to inject a release value
        ? __SENTRY_RELEASE__
        : WINDOW.SENTRY_RELEASE?.id, // This supports the variable that sentry-webpack-plugin injects
    sendClientReports: true,
  };

  return {
    ...defaultOptions,
    ...dropTopLevelUndefinedKeys(optionsArg),
  };
}

/**
 * In contrast to the regular `dropUndefinedKeys` method,
 * this one does not deep-drop keys, but only on the top level.
 */
function dropTopLevelUndefinedKeys<T extends object>(obj: T): Partial<T> {
  const mutatetedObj: Partial<T> = {};

  for (const k of Object.getOwnPropertyNames(obj)) {
    const key = k as keyof T;
    if (obj[key] !== undefined) {
      mutatetedObj[key] = obj[key];
    }
  }

  return mutatetedObj;
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
export function init(browserOptions: BrowserOptions = {}): Client | undefined {
  if (!browserOptions.skipBrowserExtensionCheck && _checkForBrowserExtension()) {
    return;
  }

  const options = applyDefaultOptions(browserOptions);
  const clientOptions: BrowserClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
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

function _isEmbeddedBrowserExtension(): boolean {
  if (typeof WINDOW.window === 'undefined') {
    // No need to show the error if we're not in a browser window environment (e.g. service workers)
    return false;
  }

  const _window = WINDOW as typeof WINDOW & ExtensionProperties;

  // Running the SDK in NW.js, which appears like a browser extension but isn't, is also fine
  // see: https://github.com/getsentry/sentry-javascript/issues/12668
  if (_window.nw) {
    return false;
  }

  const extensionObject = _window['chrome'] || _window['browser'];

  if (!extensionObject?.runtime?.id) {
    return false;
  }

  const href = getLocationHref();
  const extensionProtocols = ['chrome-extension', 'moz-extension', 'ms-browser-extension', 'safari-web-extension'];

  // Running the SDK in a dedicated extension page and calling Sentry.init is fine; no risk of data leakage
  const isDedicatedExtensionPage =
    WINDOW === WINDOW.top && extensionProtocols.some(protocol => href.startsWith(`${protocol}://`));

  return !isDedicatedExtensionPage;
}

function _checkForBrowserExtension(): true | void {
  if (_isEmbeddedBrowserExtension()) {
    if (DEBUG_BUILD) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.error(
          '[Sentry] You cannot use Sentry.init() in a browser extension, see: https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/',
        );
      });
    }

    return true;
  }
}
