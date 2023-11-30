/** Convert an OTEL time to seconds */
export function convertOtelTimeToSeconds([seconds, nano]: [number, number]): number {
  return seconds + nano / 1_000_000_000;
}
