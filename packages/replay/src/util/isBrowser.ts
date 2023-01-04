import { isNodeEnv } from '@sentry/utils';

export function isBrowser(): boolean {
  // eslint-disable-next-line no-restricted-globals
  return typeof window !== 'undefined' && (!isNodeEnv() || isElectron(window));
}

/*
  Electron renderers with nodeIntegration enabled have process defined, which means they will trigger `isNodeEnv() === false`.
  This has not been the default config for a couple of years and it's not recommended but it's still used a lot in real world applications.
  So in order to ensure we can still capture for Electron apps, we need to check for the userAgent string.
 */
function isElectron(window: Window): boolean {
  // See: https://github.com/electron/electron/issues/2288
  return /electron/i.test(window.navigator.userAgent);
}
