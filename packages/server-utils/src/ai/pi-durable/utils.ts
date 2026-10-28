/** Read a member with `this` bound to the original, so getters and methods that use `this` keep working. */
export function bound(target: object, property: PropertyKey): unknown {
  const value: unknown = Reflect.get(target, property, target);
  return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
}
