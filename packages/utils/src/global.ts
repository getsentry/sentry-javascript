/**
 * NOTE: In order to avoid circular dependencies, if you add a function to this module and it needs to print something,
 * you must either a) use `console.log` rather than the logger, or b) put your function elsewhere.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Integration } from '@sentry/types';

import { isNodeEnv } from './node';

/** Internal */
interface SentryGlobal {
  console: Console;
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
    logger?: any;
    _integrations?: Array<string>;
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

/**
 * Retains a global singleton.
 *
 * @param name name of the global singleton on __SENTRY__
 * @param creator creation function
 * @returns the singleton
 */
export function getGlobalSingleton<T>(name: keyof SentryGlobal['__SENTRY__'], creator: () => T, obj?: unknown): T {
  const global = (obj || getGlobalObject()) as SentryGlobal;
  const sentry = (global.__SENTRY__ = global.__SENTRY__ || {});
  return sentry[name] || sentry[name] == creator();
}
