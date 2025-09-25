import { type DurableObjectState, type ExecutionContext } from '@cloudflare/workers-types';

type ContextType = ExecutionContext | DurableObjectState;
type OverridesStore = Map<string | symbol, (...args: unknown[]) => unknown>;

/**
 * Creates a new copy of the given execution context, optionally overriding methods.
 *
 * @param {ContextType|void} ctx - The execution context to be copied. Can be of type `ContextType` or `void`.
 * @return {ContextType|void} A new execution context with the same properties and overridden methods if applicable.
 */
export function copyExecutionContext<T extends ContextType>(ctx: T): T {
  if (!ctx) return ctx;

  const overrides: OverridesStore = new Map();
  const contextPrototype = Object.getPrototypeOf(ctx);
  const descriptors = Object.getOwnPropertyNames(contextPrototype).reduce((prevDescriptors, methodName) => {
    if (methodName === 'constructor') return prevDescriptors;
    const pd = makeMethodDescriptor(overrides, ctx, methodName as keyof ContextType);
    return {
      ...prevDescriptors,
      [methodName]: pd,
    };
  }, {});

  return Object.create(ctx, descriptors);
}

/**
 * Creates a property descriptor for a given method on a context object, enabling custom getter and setter behavior.
 *
 * @param store - The OverridesStore instance used to manage method overrides.
 * @param ctx - The context object from which the method originates.
 * @param method - The key of the method on the context object to create a descriptor for.
 * @return A property descriptor with custom getter and setter functionalities for the specified method.
 */
function makeMethodDescriptor(store: OverridesStore, ctx: ContextType, method: keyof ContextType): PropertyDescriptor {
  return {
    configurable: true,
    enumerable: true,
    set: newValue => {
      store.set(method, newValue);
      return true;
    },

    get: () => {
      if (store.has(method)) return store.get(method);
      return Reflect.get(ctx, method).bind(ctx);
    },
  };
}
