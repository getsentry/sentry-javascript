export const setPrototypeOf =
  Object.setPrototypeOf || ({ __proto__: [] } instanceof Array ? setProtoOf : mixinProperties);

/**
 * setPrototypeOf polyfill using __proto__
 */
// eslint-disable-next-line @typescript-eslint/ban-types
function setProtoOf<TTarget extends object, TProto>(obj: TTarget, proto: TProto): TTarget & TProto {
  // @ts-ignore __proto__ does not exist on obj
  obj.__proto__ = proto;
  return obj as TTarget & TProto;
}

/**
 * setPrototypeOf polyfill using mixin
 */
// eslint-disable-next-line @typescript-eslint/ban-types
function mixinProperties<TTarget extends object, TProto>(obj: TTarget, proto: TProto): TTarget & TProto {
  for (const prop in proto) {
    // eslint-disable-next-line no-prototype-builtins
    if (!obj.hasOwnProperty(prop)) {
      // @ts-ignore typescript complains about indexing so we remove
      obj[prop] = proto[prop];
    }
  }

  return obj as TTarget & TProto;
}
