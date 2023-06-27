import { WINDOW } from '../constants';

/** If sessionStorage is available. */
export function hasSessionStorage(): boolean {
  return 'sessionStorage' in WINDOW && !!WINDOW.sessionStorage;
}
