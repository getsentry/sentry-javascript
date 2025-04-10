import { isNodeEnv } from './node';
import { GLOBAL_OBJ } from './worldwide';

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
  const process = (GLOBAL_OBJ as typeof GLOBAL_OBJ & { process?: ElectronProcess }).process;
  return process?.type === 'renderer';
}
