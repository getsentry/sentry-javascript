import { VERSION } from '@angular/core';
import { BrowserOptions, init as browserInit, SDK_VERSION } from '@sentry/browser';
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
  checkAngularVersion();
  browserInit(options);
}

function checkAngularVersion(): void {
  if (VERSION && VERSION.major) {
    const major = parseInt(VERSION.major, 10);
    if (major < ANGULAR_MINIMUM_VERSION) {
      IS_DEBUG_BUILD &&
        logger.warn(
          `The Sentry SDK does not officially support Angular ${major}.`,
          `This version of the Sentry SDK supports Angular ${ANGULAR_MINIMUM_VERSION} and above.`,
          'Please consider upgrading your Angular version or downgrading the Sentry SDK.',
        );
    }
  }
}
