import {
  type DurableObjectState,
  type DurableObjectStorage,
  type ExecutionContext,
} from '@cloudflare/workers-types';
import { instrumentDurableObjectStorage } from '../instrumentations/instrumentDurableObjectStorage';

type ContextType = ExecutionContext | DurableObjectState;
type OverridesStore<T extends ContextType> = Map<keyof T, (...args: unknown[]) => unknown>;

/**
 * Instruments an execution context or DurableObjectState with Sentry tracing.
 *
 * Creates a copy of the context that:
 * - Allows overriding of methods (e.g., waitUntil)
 * - For DurableObjectState: instruments storage operations (get, put, delete, list, etc.)
 *   to create Sentry spans automatically
 *
 * @param ctx - The execution context or DurableObjectState to instrument
 * @returns An instrumented copy of the context
 */
export function instrumentContext<T extends ContextType>(ctx: T): T {
  if (!ctx) return ctx;

  const overrides: OverridesStore<T> = new Map();
  const contextPrototype = Object.getPrototypeOf(ctx);
  const prototypeMethodNames = Object.getOwnPropertyNames(contextPrototype) as unknown as (keyof T)[];
  const ownPropertyNames = Object.getOwnPropertyNames(ctx) as unknown as (keyof T)[];
  const instrumented = new Set<unknown>(['constructor']);
  const descriptors: PropertyDescriptorMap = [...ownPropertyNames, ...prototypeMethodNames].reduce(
    (prevDescriptors, methodName) => {
      if (instrumented.has(methodName)) return prevDescriptors;
      if (typeof ctx[methodName] !== 'function') return prevDescriptors;
      instrumented.add(methodName);
      const overridableDescriptor = makeOverridableDescriptor(overrides, ctx, methodName);
      return {
        ...prevDescriptors,
        [methodName]: overridableDescriptor,
      };
    },
    {} as PropertyDescriptorMap,
  );

  // Check if this is a DurableObjectState context with a storage property
  // If so, wrap the storage with instrumentation
  if ('storage' in ctx && ctx.storage) {
    const originalStorage = ctx.storage;
    let instrumentedStorage: DurableObjectStorage | undefined;
    descriptors.storage = {
      configurable: true,
      enumerable: true,
      get: () => {
        if (!instrumentedStorage) {
          instrumentedStorage = instrumentDurableObjectStorage(originalStorage);
        }
        return instrumentedStorage;
      },
    };
    // Expose the original uninstrumented storage for internal Sentry operations
    // This avoids creating spans for internal trace linking storage operations
    descriptors.originalStorage = {
      configurable: true,
      enumerable: false,
      get: () => originalStorage,
    };
  }

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
