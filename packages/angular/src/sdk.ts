import { VERSION } from '@angular/core';
import type { BrowserOptions } from '@sentry/browser';
import {
  breadcrumbsIntegration,
  BrowserClient,
  browserSessionIntegration,
  defaultStackParser,
  globalHandlersIntegration,
  httpContextIntegration,
  linkedErrorsIntegration,
  makeFetchTransport,
  setContext,
} from '@sentry/browser';
import type { Client, Integration } from '@sentry/core';
import {
  applySdkMetadata,
  dedupeIntegration,
  functionToStringIntegration,
  getClientOptions,
  inboundFiltersIntegration,
  initAndBind,
  logger,
} from '@sentry/core';
import { IS_DEBUG_BUILD } from './flags';

/**
 * Get the default integrations for the Angular SDK.
 */
export function getDefaultIntegrations(_options: BrowserOptions = {}): Integration[] {
  // Don't include the BrowserApiErrors integration as it interferes with the Angular SDK's `ErrorHandler`:
  // BrowserApiErrors would catch certain errors before they reach the `ErrorHandler` and
  // thus provide a lower fidelity error than what `SentryErrorHandler`
  // (see errorhandler.ts) would provide.
  //
  // see:
  //  - https://github.com/getsentry/sentry-javascript/issues/5417#issuecomment-1453407097
  //  - https://github.com/getsentry/sentry-javascript/issues/2744
  return [
    // TODO(v10): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
    // eslint-disable-next-line deprecation/deprecation
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    breadcrumbsIntegration(),
    globalHandlersIntegration(),
    linkedErrorsIntegration(),
    dedupeIntegration(),
    httpContextIntegration(),
    browserSessionIntegration(),
  ];
}

/**
 * Inits the Angular SDK
 */
export function init(options: BrowserOptions): Client | undefined {
  const clientOptions = getClientOptions(options, {
    integrations: getDefaultIntegrations(options),
    stackParser: defaultStackParser,
    transport: makeFetchTransport,
  });

  applySdkMetadata(clientOptions, 'angular');

  const client = initAndBind(BrowserClient, clientOptions);

  checkAndSetAngularVersion();

  return client;
}

function checkAndSetAngularVersion(): void {
  const ANGULAR_MINIMUM_VERSION = 14;

  const angularVersion = VERSION?.major && parseInt(VERSION.major, 10);

  if (angularVersion) {
    if (angularVersion < ANGULAR_MINIMUM_VERSION) {
      IS_DEBUG_BUILD &&
        logger.warn(
          `This Sentry SDK does not officially support Angular ${angularVersion}.`,
          `This SDK only supports Angular ${ANGULAR_MINIMUM_VERSION} and above.`,
          "If you're using lower Angular versions, check the Angular Version Compatibility table in our docs: https://docs.sentry.io/platforms/javascript/guides/angular/#angular-version-compatibility.",
          'Otherwise, please consider upgrading your Angular version.',
        );
    }
    setContext('angular', { version: angularVersion });
  }
}
