/**
 * Converts a timestamp to ms, if it was in s, or keeps it as ms.
 */
export function timestampToMs(timestamp: number): number {
  const isMs = timestamp > 9999999999;
  return isMs ? timestamp : timestamp * 1000;
}
