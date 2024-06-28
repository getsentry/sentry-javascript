/** Convert an OTEL time to seconds */
export function convertOtelTimeToSeconds(otelTime: [number, number] | number): number {
  if (!Array.isArray(otelTime)) {
    return otelTime;
  }

  const [seconds, nano] = otelTime;

  return seconds + nano / 1_000_000_000;
}
