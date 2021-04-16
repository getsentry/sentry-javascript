import { NodeOptions } from '@sentry/node';
import { BrowserOptions } from '@sentry/react';
import { Options } from '@sentry/types';

export type NextjsOptions = Options | BrowserOptions | NodeOptions;
