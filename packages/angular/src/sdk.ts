import { VERSION } from '@angular/core';
import type { BrowserOptions } from '@sentry/browser';
import { defaultIntegrations, init as browserInit, SDK_VERSION, setContext } from '@sentry/browser';
import type { SdkMetadata } from '@sentry/types';
import { logger } from '@sentry/utils';

import { IS_DEBUG_BUILD } from './flags';

/**
 * Inits the Angular SDK
 */
export function init(options: BrowserOptions): void {
  const opts = {
    _metadata: {} as SdkMetadata,
    // Filter out TryCatch integration as it interferes with our Angular `ErrorHandler`:
    // TryCatch would catch certain errors before they reach the `ErrorHandler` and thus provide a
    // lower fidelity error than what `SentryErrorHandler` (see errorhandler.ts) would provide.
    // see:
    //  - https://github.com/getsentry/sentry-javascript/issues/5417#issuecomment-1453407097
    //  - https://github.com/getsentry/sentry-javascript/issues/2744
    defaultIntegrations: defaultIntegrations.filter(integration => {
      return integration.name !== 'TryCatch';
    }),
    ...options,
  };

  opts._metadata.sdk = opts._metadata.sdk || {
    name: 'sentry.javascript.angular',
    packages: [
      {
        name: 'npm:@sentry/angular',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  checkAndSetAngularVersion();
  browserInit(opts);
}

function checkAndSetAngularVersion(): void {
  const ANGULAR_MINIMUM_VERSION = 10;

  const angularVersion = VERSION && VERSION.major ? parseInt(VERSION.major, 10) : undefined;

  if (angularVersion) {
    if (angularVersion < ANGULAR_MINIMUM_VERSION) {
      IS_DEBUG_BUILD &&
        logger.warn(
          `The Sentry SDK does not officially support Angular ${angularVersion}.`,
          `This version of the Sentry SDK supports Angular ${ANGULAR_MINIMUM_VERSION} and above.`,
          'Please consider upgrading your Angular version or downgrading the Sentry SDK.',
        );
    }
    setContext('angular', { version: angularVersion });
  }
}
