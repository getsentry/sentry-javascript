import { WINDOW } from '../types';

/**
 *
 * @param urlOrPath - The URL or path to convert to an absolute URL.
 *
 * @return the absolute URL when handed a relative URL path, by
 * combining the current `window.location.origin` with param urlOrPath.
 * A path starting with `//` is treated as a path on the current origin,
 * not as a protocol-relative URL.
 *
 * If param urlOrPath is already a full or an invalid URL,
 * or URL determination fails, the original param urlOrPath is returned unchanged.
 *
 */
export function getAbsoluteUrl(urlOrPath: string): string {
  try {
    const origin = WINDOW.location.origin;
    // Callers pass untyped router arguments, which `new URL` used to stringify for us.
    const path = String(urlOrPath);
    const url = path.startsWith('//') ? new URL(`${origin}${path}`) : new URL(path, origin);
    return url.toString();
  } catch {
    // fallback, just do nothing
    return urlOrPath;
  }
}
