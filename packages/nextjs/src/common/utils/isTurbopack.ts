/**
 * Detect whether running under Turbopack
 */
export function isTurbopack(): boolean {
  if (typeof process === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return process.env?.TURBOPACK === '1' || !!(process as any)?.turbopack;
}
