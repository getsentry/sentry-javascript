import { isNodeEnv } from '@sentry/utils';

export function isBrowser(): boolean {
  // eslint-disable-next-line no-restricted-globals
  return typeof window !== 'undefined' && !isNodeEnv();
}

type ElectronProcess = { type?: string };

export function isElectronNodeRenderer(): boolean {
  return typeof process !== 'undefined' && (process as ElectronProcess).type === 'renderer';
}
