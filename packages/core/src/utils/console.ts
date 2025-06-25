import { normalizeAndSafeJoin } from './string';
import { GLOBAL_OBJ } from './worldwide';

type GlobalObjectWithUtil = typeof GLOBAL_OBJ & {
  util: {
    format: (...args: unknown[]) => string;
  };
};

/**
 * Format console arguments.
 *
 * @param values - The values to format.
 * @param normalizeDepth - The depth to normalize the values.
 * @param normalizeMaxBreadth - The maximum breadth to normalize the values.
 * @returns The formatted values.
 */
export function formatConsoleArgs(values: unknown[], normalizeDepth: number, normalizeMaxBreadth: number): string {
  return 'util' in GLOBAL_OBJ && typeof (GLOBAL_OBJ as GlobalObjectWithUtil).util.format === 'function'
    ? (GLOBAL_OBJ as GlobalObjectWithUtil).util.format(...values)
    : normalizeAndSafeJoin(values, normalizeDepth, normalizeMaxBreadth);
}
