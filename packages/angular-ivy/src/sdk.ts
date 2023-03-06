import { VERSION } from '@angular/core';
import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit, SDK_VERSION, setContext } from '@sentry/browser';
import { logger } from '@sentry/utils';

import { IS_DEBUG_BUILD } from './flags';

/**
 * Inits the Angular SDK
 */
export function init(options: BrowserOptions): void {
  options._metadata = options._metadata || {};
  options._metadata.sdk = {
    name: 'sentry.javascript.angular-ivy',
    packages: [
      {
        name: 'npm:@sentry/angular-ivy',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  checkAndSetAngularVersion();
  browserInit(options);
}

function checkAndSetAngularVersion(): void {
  const ANGULAR_MINIMUM_VERSION = 12;

  const angularVersion = VERSION && VERSION.major ? parseInt(VERSION.major, 10) : undefined;

  if (angularVersion) {
    if (angularVersion < ANGULAR_MINIMUM_VERSION) {
      IS_DEBUG_BUILD &&
        logger.warn(
          `This Sentry SDK does not officially support Angular ${angularVersion}.`,
          `This SDK only supports Angular ${ANGULAR_MINIMUM_VERSION} and above.`,
          "If you're using Angular 10 or 11, please use `@sentry/angular` instead.",
          'Otherwise, please consider upgrading your Angular version.',
        );
    }
    setContext('angular', { version: angularVersion });
  }
}
