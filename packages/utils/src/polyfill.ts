export const setPrototypeOf =
  Object.setPrototypeOf || ({ __proto__: [] } instanceof Array ? setProtoOf : mixinProperties); // tslint:disable-line:no-unbound-method

/**
 * setPrototypeOf polyfill using __proto__
 */
function setProtoOf<TTarget extends object, TProto>(obj: TTarget, proto: TProto): TTarget & TProto {
  // @ts-ignore
  obj.__proto__ = proto;
  return obj as TTarget & TProto;
}

/**
 * setPrototypeOf polyfill using mixin
 */
function mixinProperties<TTarget extends object, TProto>(obj: TTarget, proto: TProto): TTarget & TProto {
  for (const prop in proto) {
    if (!obj.hasOwnProperty(prop)) {
      // @ts-ignore
      obj[prop] = proto[prop];
    }
  }

  return obj as TTarget & TProto;
}
