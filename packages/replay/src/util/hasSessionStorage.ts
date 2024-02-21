import { WINDOW } from '../constants';

/** If sessionStorage is available. */
export function hasSessionStorage(): boolean {
  try {
    // This can throw, e.g. when being accessed in a sandboxed iframe
    return 'sessionStorage' in WINDOW && !!WINDOW.sessionStorage;
  } catch {
    return false;
  }
}
