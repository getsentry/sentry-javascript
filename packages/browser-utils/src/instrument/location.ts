import { WINDOW } from '../types';

/**
 *
 * @param urlOrPath - The URL or path to convert to an absolute URL.
 *
 * @return the absolute URL when handed a relative URL path, by
 * combining the current `window.location.origin` with param urlOrPath.
 *
 * If param urlOrPath is already a full or an invalid URL,
 * or URL determination fails, the original param urlOrPath is returned unchanged.
 *
 */
export function getAbsoluteUrl(urlOrPath: string): string {
  try {
    const url = new URL(urlOrPath, WINDOW.location.origin);
    return url.toString();
  } catch {
    // fallback, just do nothing
    return urlOrPath;
  }
}
