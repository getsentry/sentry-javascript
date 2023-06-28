// Originals of the buildPolyfills from Sucrase and Rollup we use (which we have adapted in various ways), preserved here for testing, to prove that
// the modified versions do the same thing the originals do.

// From Sucrase
export function _asyncNullishCoalesce(lhs, rhsFn) {
  if (lhs != null) {
    return lhs;
  } else {
    return rhsFn();
  }
}

// From Sucrase
export async function _asyncOptionalChain(ops) {
  let lastAccessLHS = undefined;
  let value = ops[0];
  let i = 1;
  while (i < ops.length) {
    const op = ops[i];
    const fn = ops[i + 1];
    i += 2;
    if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) {
      return undefined;
    }
    if (op === 'access' || op === 'optionalAccess') {
      lastAccessLHS = value;
      value = await fn(value);
    } else if (op === 'call' || op === 'optionalCall') {
      value = await fn((...args) => value.call(lastAccessLHS, ...args));
      lastAccessLHS = undefined;
    }
  }
  return value;
}

// From Sucrase
export async function _asyncOptionalChainDelete(ops) {
  const result = await _asyncOptionalChain(ops);
  // by checking for loose equality to `null`, we catch both `null` and `undefined`
  return result == null ? true : result;
}

// From Sucrase
export function _createNamedExportFrom(obj, localName, importedName) {
  Object.defineProperty(exports, localName, { enumerable: true, get: () => obj[importedName] });
}

// From Sucrase
export function _createStarExport(obj) {
  Object.keys(obj)
    .filter(key => key !== 'default' && key !== '__esModule')
    .forEach(key => {
      // eslint-disable-next-line no-prototype-builtins
      if (exports.hasOwnProperty(key)) {
        return;
      }
      Object.defineProperty(exports, key, { enumerable: true, get: () => obj[key] });
    });
}

// From Rollup
export function _interopDefault(e) {
  return e && e.__esModule ? e['default'] : e;
}

// From Rollup
export function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    // eslint-disable-next-line guard-for-in
    for (var k in e) {
      n[k] = e[k];
    }
  }
  n['default'] = e;
  return n;
}

export function _interopNamespaceDefaultOnly(e) {
  return {
    __proto__: null,
    default: e,
  };
}

// From Sucrase
export function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

// From Sucrase
export function _interopRequireWildcard(obj) {
  if (obj && obj.__esModule) {
    return obj;
  } else {
    var newObj = {};
    if (obj != null) {
      for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          newObj[key] = obj[key];
        }
      }
    }
    newObj.default = obj;
    return newObj;
  }
}

// From Sucrase
export function _nullishCoalesce(lhs, rhsFn) {
  if (lhs != null) {
    return lhs;
  } else {
    return rhsFn();
  }
}

// From Sucrase
export function _optionalChain(ops) {
  let lastAccessLHS = undefined;
  let value = ops[0];
  let i = 1;
  while (i < ops.length) {
    const op = ops[i];
    const fn = ops[i + 1];
    i += 2;
    if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) {
      return undefined;
    }
    if (op === 'access' || op === 'optionalAccess') {
      lastAccessLHS = value;
      value = fn(value);
    } else if (op === 'call' || op === 'optionalCall') {
      value = fn((...args) => value.call(lastAccessLHS, ...args));
      lastAccessLHS = undefined;
    }
  }
  return value;
}

// From Sucrase
export function _optionalChainDelete(ops) {
  const result = _optionalChain(ops);
  // by checking for loose equality to `null`, we catch both `null` and `undefined`
  return result == null ? true : result;
}
