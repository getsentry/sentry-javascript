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
  return (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    (GLOBAL_OBJ as any).process !== undefined && ((GLOBAL_OBJ as any).process as ElectronProcess).type === 'renderer'
  );
}
