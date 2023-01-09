import { isNodeEnv } from '@sentry/utils';

/**
 * Returns true if we are in the browser.
 */
export function isBrowser(): boolean {
  // eslint-disable-next-line no-restricted-globals
  return typeof window !== 'undefined' && (!isNodeEnv() || isElectronNodeRenderer());
}

type ElectronProcess = { type?: string };

// Electron renderers with nodeIntegration enabled are detected as Node.js so we specifically test for them
function isElectronNodeRenderer(): boolean {
  return typeof process !== 'undefined' && (process as ElectronProcess).type === 'renderer';
}
