import { NodeOptions } from '@sentry/node';
import { BrowserOptions } from '@sentry/react';
import { Options } from '@sentry/types';

export interface NextjsOptions extends Options, BrowserOptions, NodeOptions {
  // TODO: options for NextJS
}
