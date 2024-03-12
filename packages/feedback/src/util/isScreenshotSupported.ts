import { NAVIGATOR } from '../constants';

/**
 * Mobile browsers do not support `mediaDevices.getDisplayMedia` even though they have the api implemented
 * Instead they return things like `NotAllowedError` when called.
 *
 * It's simpler for us to browser sniff first, and avoid loading the integration if we can.
 *
 * https://stackoverflow.com/a/58879212
 * https://stackoverflow.com/a/3540295
 */
export function isScreenshotSupported(): boolean {
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(NAVIGATOR.userAgent)) {
    return false;
  }
  return true;
}
