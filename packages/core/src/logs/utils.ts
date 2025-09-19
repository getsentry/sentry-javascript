import { isPrimitive } from '../utils/is';
import { normalize } from '../utils/normalize';
import { GLOBAL_OBJ } from '../utils/worldwide';

type GlobalObjectWithUtil = typeof GLOBAL_OBJ & {
  util: {
    format: (...args: unknown[]) => string;
  };
};

/**
 * Formats the given values into a string.
 *
 * @param values - The values to format.
 * @param normalizeDepth - The depth to normalize the values.
 * @param normalizeMaxBreadth - The max breadth to normalize the values.
 * @returns The formatted string.
 */
export function formatConsoleArgs(values: unknown[], normalizeDepth: number, normalizeMaxBreadth: number): string {
  return 'util' in GLOBAL_OBJ && typeof (GLOBAL_OBJ as GlobalObjectWithUtil).util.format === 'function'
    ? (GLOBAL_OBJ as GlobalObjectWithUtil).util.format(...values)
    : safeJoinConsoleArgs(values, normalizeDepth, normalizeMaxBreadth);
}

/**
 * Joins the given values into a string.
 *
 * @param values - The values to join.
 * @param normalizeDepth - The depth to normalize the values.
 * @param normalizeMaxBreadth - The max breadth to normalize the values.
 * @returns The joined string.
 */
export function safeJoinConsoleArgs(values: unknown[], normalizeDepth: number, normalizeMaxBreadth: number): string {
  return values
    .map(value =>
      isPrimitive(value) ? String(value) : JSON.stringify(normalize(value, normalizeDepth, normalizeMaxBreadth)),
    )
    .join(' ');
}

/**
 * Checks if a string contains console substitution patterns like %s, %d, %i, %f, %o, %O, %c.
 *
 * @param str - The string to check
 * @returns true if the string contains console substitution patterns
 */
export function hasConsoleSubstitutions(str: string): boolean {
  // Match console substitution patterns: %s, %d, %i, %f, %o, %O, %c
  return /%[sdifocO]/.test(str);
}

/**
 * Creates template attributes for multiple console arguments.
 *
 * @param args - The console arguments
 * @returns An object with template and parameter attributes
 */
export function createConsoleTemplateAttributes(firstArg: unknown, followingArgs: unknown[]): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};

  // Create template with placeholders for each argument
  const template = new Array(followingArgs.length).fill('{}').join(' ');
  attributes['sentry.message.template'] = `${firstArg} ${template}`;

  // Add each argument as a parameter
  followingArgs.forEach((arg, index) => {
    attributes[`sentry.message.parameter.${index}`] = arg;
  });

  return attributes;
}
