import { type DurableObjectState, type ExecutionContext } from '@cloudflare/workers-types';

const kBound = Symbol.for('kBound');

const defaultPropertyOptions: PropertyDescriptor = {
  enumerable: true,
  configurable: true,
  writable: true,
};

/**
 * Clones the given execution context by creating a shallow copy while ensuring the binding of specific methods.
 *
 * @param {ExecutionContext|DurableObjectState|void} ctx - The execution context to clone. Can be void.
 * @return {ExecutionContext|DurableObjectState|void} A cloned execution context with bound methods, or the original void value if no context was provided.
 */
export function copyExecutionContext<T extends ExecutionContext | DurableObjectState>(ctx: T): T {
  if (!ctx) return ctx;
  return Object.create(ctx, {
    waitUntil: { ...defaultPropertyOptions, value: copyBound(ctx, 'waitUntil') },
    ...('passThroughOnException' in ctx && {
      passThroughOnException: { ...defaultPropertyOptions, value: copyBound(ctx, 'passThroughOnException') },
    }),
  });
}

function copyBound<T, K extends keyof T>(obj: T, method: K): T[K] {
  const method_impl = obj[method];
  if (typeof method_impl !== 'function') return method_impl;
  if ((method_impl as T[K] & { [kBound]?: boolean })[kBound]) return method_impl;

  return new Proxy(method_impl.bind(obj), {
    get: (target, key, receiver) => {
      if ('bind' === key) {
        return () => receiver;
      } else if (kBound === key) {
        return true;
      }
      return Reflect.get(target, key, receiver);
    },
  });
}
