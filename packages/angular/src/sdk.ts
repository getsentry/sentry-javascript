import { VERSION } from '@angular/core';
import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit, SDK_VERSION, setContext } from '@sentry/browser';
import { logger } from '@sentry/utils';

import { ANGULAR_MINIMUM_VERSION } from './constants';
import { IS_DEBUG_BUILD } from './flags';

/**
 * Inits the Angular SDK
 */
export function init(options: BrowserOptions): void {
  options._metadata = options._metadata || {};
  options._metadata.sdk = {
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
  browserInit(options);
}

function checkAndSetAngularVersion(): void {
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
