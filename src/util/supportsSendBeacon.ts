/**
 * Determine if there is browser support for `navigator.sendBeacon`
 */
export function supportsSendBeacon() {
  return 'navigator' in window && 'sendBeacon' in window.navigator;
}
