import { isNodeEnv } from '@sentry/utils';

export function isBrowser(): boolean {
  return typeof window !== 'undefined' && !isNodeEnv();
}
