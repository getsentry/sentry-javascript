import { type DurableObjectState, type ExecutionContext } from '@cloudflare/workers-types';

type ContextType = ExecutionContext | DurableObjectState;
type OverridesStore<T extends ContextType> = Map<keyof T, (...args: unknown[]) => unknown>;

/**
 * Creates a new copy of the given execution context, optionally overriding methods.
 *
 * @param {ContextType|void} ctx - The execution context to be copied. Can be of type `ContextType` or `void`.
 * @return {ContextType|void} A new execution context with the same properties and overridden methods if applicable.
 */
export function copyExecutionContext<T extends ContextType>(ctx: T): T {
  if (!ctx) return ctx;

  const overrides: OverridesStore<T> = new Map();
  const contextPrototype = Object.getPrototypeOf(ctx);
  const prototypeMethodNames = Object.getOwnPropertyNames(contextPrototype) as unknown as (keyof T)[];
  const ownPropertyNames = Object.getOwnPropertyNames(ctx) as unknown as (keyof T)[];
  const instrumented = new Set<unknown>(['constructor']);
  const descriptors = [...ownPropertyNames, ...prototypeMethodNames].reduce((prevDescriptors, methodName) => {
    if (instrumented.has(methodName)) return prevDescriptors;
    if (typeof ctx[methodName] !== 'function') return prevDescriptors;
    instrumented.add(methodName);
    const overridableDescriptor = makeOverridableDescriptor(overrides, ctx, methodName);
    return {
      ...prevDescriptors,
      [methodName]: overridableDescriptor,
    };
  }, {});

  return Object.create(ctx, descriptors);
}

/**
 * Creates a property descriptor that allows overriding of a method on the given context object.
 *
 * This descriptor supports property overriding with functions only. It delegates method calls to
 * the provided store if an override exists or to the original method on the context otherwise.
 *
 * @param {OverridesStore<ContextType>} store - The storage for overridden methods specific to the context type.
 * @param {ContextType} ctx - The context object that contains the method to be overridden.
 * @param {keyof ContextType} method - The method on the context object to create the overridable descriptor for.
 * @return {PropertyDescriptor} A property descriptor enabling the overriding of the specified method.
 */
function makeOverridableDescriptor<T extends ContextType>(
  store: OverridesStore<T>,
  ctx: T,
  method: keyof T,
): PropertyDescriptor {
  return {
    configurable: true,
    enumerable: true,
    set: newValue => {
      if (typeof newValue == 'function') {
        store.set(method, newValue);
        return;
      }
      Reflect.set(ctx, method, newValue);
    },

    get: () => {
      if (store.has(method)) return store.get(method);
      const methodFunction = Reflect.get(ctx, method);
      if (typeof methodFunction !== 'function') return methodFunction;
      // We should do bind() to make sure that the method is bound to the context object - otherwise it will not work
      return methodFunction.bind(ctx);
    },
  };
}
