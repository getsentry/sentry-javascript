import { WINDOW } from '../constants';

/**
 * Takes the full URL from `window.location` and returns it as a string.
 */
export function getFullURL(): string {
  const urlPath = `${WINDOW.location.pathname}${WINDOW.location.hash}${WINDOW.location.search}`;
  const url = `${WINDOW.location.origin}${urlPath}`;
  return url;
}
