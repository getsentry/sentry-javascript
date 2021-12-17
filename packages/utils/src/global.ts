/**
 * NOTE: In order to avoid circular dependencies, if you add a function to this module and it needs to print something,
 * you must either a) use `console.log` rather than the logger, or b) put your function elsewhere.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Integration } from '@sentry/types';

import { isBrowserBundle } from './env';

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

// eslint-disable-next-line no-restricted-globals
const getBrowserEnv = <T>(): T & SentryGlobal => (window || self || fallbackGlobalObject) as T & SentryGlobal;
// eslint-disable-next-line no-restricted-globals
const getNodeEnv = <T>(): T & SentryGlobal => (global || fallbackGlobalObject) as T & SentryGlobal;

/**
 * Safely get global scope object
 *
 * @returns Global scope object
 */
export function getGlobalObject<T>(): T & SentryGlobal {
  if (isBrowserBundle()) return getBrowserEnv();
  return getNodeEnv();
}
