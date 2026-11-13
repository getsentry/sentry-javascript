/**
 * 32-bit FNV-1a. Keep this algorithm stable: tunnel paths must match across SDK versions.
 */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    // eslint-disable-next-line no-bitwise
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  // eslint-disable-next-line no-bitwise
  return (hash >>> 0).toString(36);
}
