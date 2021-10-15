/* eslint-disable @typescript-eslint/no-explicit-any */
import { Integration } from '@sentry/types';

import { isNodeEnv } from './node';

/** Internal */
interface SentryGlobal {
  Sentry?: {
    Integrations?: Integration[];
  };
  SENTRY_ENVIRONMENT?: string;
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: {
    id?: string;
  };
  __SENTRY__: {
    globalEventProcessors: any;
    hub: any;
    logger: any;
  };
}

const fallbackGlobalObject = {};

/**
 * Safely get global scope object
 *
 * @returns Global scope object
 */
export function getGlobalObject<T>(): T & SentryGlobal {
  return (isNodeEnv()
    ? global
    : typeof window !== 'undefined' // eslint-disable-line no-restricted-globals
    ? window // eslint-disable-line no-restricted-globals
    : typeof self !== 'undefined'
    ? self
    : fallbackGlobalObject) as T & SentryGlobal;
}
