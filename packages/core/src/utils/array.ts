/**
 * Return a new array with duplicate values removed, preserving first-occurrence order.
 *
 * @param input the array to deduplicate
 * @returns a new array containing each distinct value once, in the order it first appeared
 */
export function uniq<T>(input: T[]): T[] {
  return Array.from(new Set(input));
}
