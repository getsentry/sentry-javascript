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
    waitUntil: { ...defaultPropertyOptions, value: copyAndBindMethod(ctx, 'waitUntil') },
    ...('passThroughOnException' in ctx && {
      passThroughOnException: { ...defaultPropertyOptions, value: copyAndBindMethod(ctx, 'passThroughOnException') },
    }),
  });
}

/**
 * Copies a method from the given object and ensures the copied method remains bound to the original object's context.
 *
 * @param {object} obj - The object containing the method to be copied and bound.
 * @param {string|symbol} method - The key of the method within the object to be copied and bound.
 * @return {Function} - The copied and bound method, or the original property if it is not a function.
 */
function copyAndBindMethod<T, K extends keyof T>(obj: T, method: K): T[K] {
  const methodImpl = obj[method];
  if (typeof methodImpl !== 'function') return methodImpl;
  if ((methodImpl as T[K] & { [kBound]?: boolean })[kBound]) return methodImpl;
  const bound = methodImpl.bind(obj);

  return new Proxy(bound, {
    get: (target, prop, receiver) => {
      if (kBound === prop) return true;
      if ('bind' === prop) return () => receiver;
      return Reflect.get(target, prop, receiver);
    },
  });
}
