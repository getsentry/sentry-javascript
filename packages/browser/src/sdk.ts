import { getCurrentScope } from '@sentry/core';
import { functionToStringIntegration, inboundFiltersIntegration } from '@sentry/core';
import {
  captureSession,
  getClient,
  getIntegrationsToSetup,
  getReportDialogEndpoint,
  initAndBind,
  startSession,
} from '@sentry/core';
import type { DsnLike, Integration, Options, UserFeedback } from '@sentry/types';
import { consoleSandbox, logger, stackParserFromStackParserOptions, supportsFetch } from '@sentry/utils';

import { addHistoryInstrumentationHandler } from '@sentry-internal/browser-utils';
import { dedupeIntegration } from '@sentry/core';
import type { BrowserClientOptions, BrowserOptions } from './client';
import { BrowserClient } from './client';
import { DEBUG_BUILD } from './debug-build';
import { WINDOW } from './helpers';
import { breadcrumbsIntegration } from './integrations/breadcrumbs';
import { browserApiErrorsIntegration } from './integrations/browserapierrors';
import { globalHandlersIntegration } from './integrations/globalhandlers';
import { httpContextIntegration } from './integrations/httpcontext';
import { linkedErrorsIntegration } from './integrations/linkederrors';
import { defaultStackParser } from './stack-parsers';
import { makeFetchTransport } from './transports/fetch';

/** Get the default integrations for the browser SDK. */
export function getDefaultIntegrations(_options: Options): Integration[] {
  /**
   * Note: Please make sure this stays in sync with Angular SDK, which re-exports
   * `getDefaultIntegrations` but with an adjusted set of integrations.
   */
  return [
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    browserApiErrorsIntegration(),
    breadcrumbsIntegration(),
    globalHandlersIntegration(),
    linkedErrorsIntegration(),
    dedupeIntegration(),
    httpContextIntegration(),
  ];
}

function applyDefaultOptions(optionsArg: BrowserOptions = {}): BrowserOptions {
  const defaultOptions: BrowserOptions = {
    defaultIntegrations: getDefaultIntegrations(optionsArg),
    release:
      typeof __SENTRY_RELEASE__ === 'string' // This allows build tooling to find-and-replace __SENTRY_RELEASE__ to inject a release value
        ? __SENTRY_RELEASE__
        : WINDOW.SENTRY_RELEASE && WINDOW.SENTRY_RELEASE.id // This supports the variable that sentry-webpack-plugin injects
          ? WINDOW.SENTRY_RELEASE.id
          : undefined,
    autoSessionTracking: true,
    sendClientReports: true,
  };

  return { ...defaultOptions, ...optionsArg };
}

function shouldShowBrowserExtensionError(): boolean {
  const windowWithMaybeChrome = WINDOW as typeof WINDOW & { chrome?: { runtime?: { id?: string } } };
  const isInsideChromeExtension =
    windowWithMaybeChrome &&
    windowWithMaybeChrome.chrome &&
    windowWithMaybeChrome.chrome.runtime &&
    windowWithMaybeChrome.chrome.runtime.id;

  const windowWithMaybeBrowser = WINDOW as typeof WINDOW & { browser?: { runtime?: { id?: string } } };
  const isInsideBrowserExtension =
    windowWithMaybeBrowser &&
    windowWithMaybeBrowser.browser &&
    windowWithMaybeBrowser.browser.runtime &&
    windowWithMaybeBrowser.browser.runtime.id;

  return !!isInsideBrowserExtension || !!isInsideChromeExtension;
}

/**
 * A magic string that build tooling can leverage in order to inject a release value into the SDK.
 */
declare const __SENTRY_RELEASE__: string | undefined;

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
export function init(browserOptions: BrowserOptions = {}): void {
  const options = applyDefaultOptions(browserOptions);

  if (shouldShowBrowserExtensionError()) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.error(
        '[Sentry] You cannot run Sentry this way in a browser extension, check: https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/',
      );
    });
    return;
  }

  if (DEBUG_BUILD) {
    if (!supportsFetch()) {
      logger.warn(
        'No Fetch API detected. The Sentry SDK requires a Fetch API compatible environment to send events. Please add a Fetch API polyfill.',
      );
    }
  }
  const clientOptions: BrowserClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeFetchTransport,
  };

  initAndBind(BrowserClient, clientOptions);

  if (options.autoSessionTracking) {
    startSessionTracking();
  }
}

/**
 * All properties the report dialog supports
 */
export interface ReportDialogOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  eventId: string;
  dsn?: DsnLike;
  user?: {
    email?: string;
    name?: string;
  };
  lang?: string;
  title?: string;
  subtitle?: string;
  subtitle2?: string;
  labelName?: string;
  labelEmail?: string;
  labelComments?: string;
  labelClose?: string;
  labelSubmit?: string;
  errorGeneric?: string;
  errorFormEntry?: string;
  successMessage?: string;
  /** Callback after reportDialog showed up */
  onLoad?(this: void): void;
  /** Callback after reportDialog closed */
  onClose?(this: void): void;
}

/**
 * Present the user with a report dialog.
 *
 * @param options Everything is optional, we try to fetch all info need from the global scope.
 */
export function showReportDialog(options: ReportDialogOptions): void {
  // doesn't work without a document (React Native)
  if (!WINDOW.document) {
    DEBUG_BUILD && logger.error('Global document not defined in showReportDialog call');
    return;
  }

  const scope = getCurrentScope();
  const client = scope.getClient();
  const dsn = client && client.getDsn();

  if (!dsn) {
    DEBUG_BUILD && logger.error('DSN not configured for showReportDialog call');
    return;
  }

  if (scope) {
    options.user = {
      ...scope.getUser(),
      ...options.user,
    };
  }

  const script = WINDOW.document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = getReportDialogEndpoint(dsn, options);

  if (options.onLoad) {
    script.onload = options.onLoad;
  }

  const { onClose } = options;
  if (onClose) {
    const reportDialogClosedMessageHandler = (event: MessageEvent): void => {
      if (event.data === '__sentry_reportdialog_closed__') {
        try {
          onClose();
        } finally {
          WINDOW.removeEventListener('message', reportDialogClosedMessageHandler);
        }
      }
    };
    WINDOW.addEventListener('message', reportDialogClosedMessageHandler);
  }

  const injectionPoint = WINDOW.document.head || WINDOW.document.body;
  if (injectionPoint) {
    injectionPoint.appendChild(script);
  } else {
    DEBUG_BUILD && logger.error('Not injecting report dialog. No injection point found in HTML');
  }
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

/**
 * Enable automatic Session Tracking for the initial page load.
 */
function startSessionTracking(): void {
  if (typeof WINDOW.document === 'undefined') {
    DEBUG_BUILD && logger.warn('Session tracking in non-browser environment with @sentry/browser is not supported.');
    return;
  }

  // The session duration for browser sessions does not track a meaningful
  // concept that can be used as a metric.
  // Automatically captured sessions are akin to page views, and thus we
  // discard their duration.
  startSession({ ignoreDuration: true });
  captureSession();

  // We want to create a session for every navigation as well
  addHistoryInstrumentationHandler(({ from, to }) => {
    // Don't create an additional session for the initial route or if the location did not change
    if (from !== undefined && from !== to) {
      startSession({ ignoreDuration: true });
      captureSession();
    }
  });
}

/**
 * Captures user feedback and sends it to Sentry.
 */
export function captureUserFeedback(feedback: UserFeedback): void {
  const client = getClient<BrowserClient>();
  if (client) {
    client.captureUserFeedback(feedback);
  }
}
