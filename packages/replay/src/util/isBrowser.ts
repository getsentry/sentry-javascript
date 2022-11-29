import { isNodeEnv } from '@sentry/utils';

export function isBrowser(): boolean {
  // eslint-disable-next-line no-restricted-globals
  return typeof window !== 'undefined' && !isNodeEnv();
}
