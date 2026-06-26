/** A function of unknown signature, matching the methods/handlers we wrap. */
export type AnyFn = (this: unknown, ...args: unknown[]) => unknown;

/**
 * The orchestrion tracing-channel context. `arguments` is the live call args
 * array; `result` is the (sync) return value, mutable when `mutableResult` is set.
 */
export interface ChannelContext {
  arguments: unknown[];
  moduleVersion?: string;
  result?: unknown;
  error?: unknown;
}

/**
 * Marks a function as already wrapped so repeated subscriptions (eg a second
 * `setupOnce`) or multiple decorators on one method don't double-wrap it.
 */
const SENTRY_WRAPPED = Symbol.for('sentry.orchestrion.nestjs.wrapped');

/** Whether `fn` has already been wrapped by this integration. */
export function isWrapped(fn: AnyFn): boolean {
  return !!(fn as AnyFn & Record<symbol, unknown>)[SENTRY_WRAPPED];
}

/** Mark `fn` as wrapped (see {@link isWrapped}). */
export function markWrapped(fn: AnyFn): void {
  (fn as AnyFn & Record<symbol, unknown>)[SENTRY_WRAPPED] = true;
}
