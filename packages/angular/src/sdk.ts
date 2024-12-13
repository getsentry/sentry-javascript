import { VERSION } from '@angular/core';
import type { BrowserOptions } from '@sentry/browser';
import {
  breadcrumbsIntegration,
  init as browserInit,
  browserSessionIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  linkedErrorsIntegration,
  setContext,
} from '@sentry/browser';
import type { Client, Integration } from '@sentry/core';
import {
  applySdkMetadata,
  dedupeIntegration,
  functionToStringIntegration,
  inboundFiltersIntegration,
  logger,
} from '@sentry/core';

import { IS_DEBUG_BUILD } from './flags';

/**
 * Get the default integrations for the Angular SDK.
 */
export function getDefaultIntegrations(options: BrowserOptions = {}): Integration[] {
  // Don't include the BrowserApiErrors integration as it interferes with the Angular SDK's `ErrorHandler`:
  // BrowserApiErrors would catch certain errors before they reach the `ErrorHandler` and
  // thus provide a lower fidelity error than what `SentryErrorHandler`
  // (see errorhandler.ts) would provide.
  //
  // see:
  //  - https://github.com/getsentry/sentry-javascript/issues/5417#issuecomment-1453407097
  //  - https://github.com/getsentry/sentry-javascript/issues/2744
  const integrations = [
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    breadcrumbsIntegration(),
    globalHandlersIntegration(),
    linkedErrorsIntegration(),
    dedupeIntegration(),
    httpContextIntegration(),
  ];

  // eslint-disable-next-line deprecation/deprecation
  if (options.autoSessionTracking !== false) {
    integrations.push(browserSessionIntegration());
  }

  return integrations;
}

/**
 * Inits the Angular SDK
 */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    defaultIntegrations: getDefaultIntegrations(),
    ...options,
  };

  applySdkMetadata(opts, 'angular');

  checkAndSetAngularVersion();
  return browserInit(opts);
}

function checkAndSetAngularVersion(): void {
  const ANGULAR_MINIMUM_VERSION = 14;

  const angularVersion = VERSION && VERSION.major ? parseInt(VERSION.major, 10) : undefined;

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
