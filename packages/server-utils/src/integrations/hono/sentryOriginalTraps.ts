// oxlint-disable-next-line typescript/no-unsafe-function-type
type AnyFunction = Function;

/**
 * Proxy traps that expose `original` as `__sentry_original__` on a wrapping Proxy without defining it on the target,
 * which is the original itself. `functionToStringIntegration` only unwraps own properties, so the property has to
 * look like an own one too.
 */
export function sentryOriginalTraps<T extends AnyFunction>(
  original: AnyFunction,
): Pick<ProxyHandler<T>, 'get' | 'getOwnPropertyDescriptor'> {
  return {
    get(target, prop, receiver) {
      if (prop === '__sentry_original__') {
        return original;
      }
      return Reflect.get(target, prop, receiver);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop === '__sentry_original__') {
        return { value: original, writable: true, enumerable: false, configurable: true };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  };
}
