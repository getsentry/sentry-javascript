/**
 * Given an initial timestamp and an expiry duration, checks to see if current
 * time should be considered as expired.
 */
export function isExpired(
  initialTime: number,
  expiry: number,
  targetTime: number = +new Date()
) {
  // Always expired if < 0
  if (expiry < 0) {
    return true;
  }

  // Never expires if == 0
  if (expiry === 0) {
    return false;
  }

  return initialTime + expiry <= targetTime;
}
