/**
 * A more comprehensive key property check.
 */
export function hasProp<T extends string>(obj: unknown, prop: T): obj is Record<string, unknown> {
  return !!obj && typeof obj === 'object' && !!(obj as Record<string, unknown>)[prop];
}
