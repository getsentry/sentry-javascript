import { NodeOptions } from '@sentry/node';
import { BrowserOptions } from '@sentry/react';
import { Options } from '@sentry/types';

export interface NextjsOptions extends Options, BrowserOptions, NodeOptions {
  /**
   * A flag enabling the initialization of the SDK in development and other
   * non-production environments. By default, the SDK is only initialised in
   * production.
   */
  enableInDev?: boolean;
}
