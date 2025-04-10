/**
 * This is a minimal version of `wrap` from shimmer:
 * https://github.com/othiym23/shimmer/blob/master/index.js
 *
 * In contrast to the original implementation, this version does not allow to unwrap,
 * and does not make it clear that the method is wrapped.
 * This is necessary because we want to wrap the http module with our own code,
 * while still allowing to use the HttpInstrumentation from OTEL.
 *
 * Without this, if we'd just use `wrap` from shimmer, the OTEL instrumentation would remove our wrapping,
 * because it only allows any module to be wrapped a single time.
 */
export function stealthWrap<Nodule extends object, FieldName extends keyof Nodule>(
  nodule: Nodule,
  name: FieldName,
  wrapper: (original: Nodule[FieldName]) => Nodule[FieldName],
): Nodule[FieldName] {
  const original = nodule[name];
  const wrapped = wrapper(original);

  defineProperty(nodule, name, wrapped);
  return wrapped;
}

// Sets a property on an object, preserving its enumerability.
function defineProperty<Nodule extends object, FieldName extends keyof Nodule>(
  obj: Nodule,
  name: FieldName,
  value: Nodule[FieldName],
): void {
  const enumerable = !!obj[name] && Object.prototype.propertyIsEnumerable.call(obj, name);

  Object.defineProperty(obj, name, {
    configurable: true,
    enumerable: enumerable,
    writable: true,
    value: value,
  });
}
