import { NodeOptions } from '@sentry/node';
import { BrowserOptions } from '@sentry/react';
import { Options } from '@sentry/types';

export interface NextjsOptions extends Options, BrowserOptions, NodeOptions {
  /**
   * A flag forcing the initialization of the SDK.
   * By default, the SDK is only initialised in production.
   */
  forceInit?: boolean;
}
