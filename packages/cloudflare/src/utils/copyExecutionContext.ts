import { type ExecutionContext } from '@cloudflare/workers-types';

const kBound = Symbol.for('kBound');

/**
 * Clones the given execution context by creating a shallow copy while ensuring the binding of specific methods.
 *
 * @param {ExecutionContext|void} ctx - The execution context to clone. Can be void.
 * @return {ExecutionContext|void} A cloned execution context with bound methods, or the original void value if no context was provided.
 */
export function copyExecutionContext<T extends ExecutionContext | void>(ctx: T): T {
  if (!ctx) return ctx;
  return Object.assign({}, ctx, {
    ...('waitUntil' in ctx && { waitUntil: copyBound(ctx, 'waitUntil') }),
    ...('passThroughOnException' in ctx && { passThroughOnException: copyBound(ctx, 'passThroughOnException') }),
  });
}

function copyBound<T extends object, K extends keyof T>(obj: T, method: K): T[K] {
  const method_impl = obj[method];
  if (typeof method_impl !== 'function') return method_impl;
  if ((method_impl as T[K] & { [kBound]?: boolean })[kBound]) return method_impl;

  const bound = method_impl.bind(obj);
  return Object.defineProperty(bound, kBound, { value: true, enumerable: false });
}
