import { WINDOW } from '../constants';

/**
 * Enqueue a callback to be executed during the next idle period.
 * After a max. of 50ms, it will be executed anyhow.
 *
 * Note that if `window.requestIdleCallback` is not supported (e.g. in Safari), we'll just execute the callback immediately.
 */
export function requestIdleCallback(cb: () => void): void {
  if (WINDOW.requestIdleCallback) {
    WINDOW.requestIdleCallback(cb, { timeout: 50 });
  } else {
    cb();
  }
}
