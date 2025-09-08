import { type ExecutionContext } from '@cloudflare/workers-types';

/**
 * Clones the given execution context by creating a shallow copy while ensuring the binding of specific methods.
 *
 * @param {ExecutionContext|undefined} ctx - The execution context to clone. Can be undefined.
 * @return {ExecutionContext|undefined} A cloned execution context with bound methods, or the original undefined value if no context was provided.
 */
export function cloneExecutionContext<T extends ExecutionContext | undefined>(ctx: T): T {
  if (!ctx) return ctx;
  return {
    ...ctx,
    ...('waitUntil' in ctx && { waitUntil: ctx.waitUntil.bind(ctx) }),
    ...('passThroughOnException' in ctx && { passThroughOnException: ctx.passThroughOnException.bind(ctx) }),
  };
}
