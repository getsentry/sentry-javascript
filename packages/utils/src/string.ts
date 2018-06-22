/**
 * Encodes given object into url-friendly format
 *
 * @param str An object that contains serializable values
 * @param max Maximum number of characters in truncated string
 * @returns string Encoded
 */

export function truncate(str: string, max: number): string {
  if (max === 0) {
    return str;
  }
  return str.length <= max ? str : `${str.substr(0, max)}\u2026`;
}
