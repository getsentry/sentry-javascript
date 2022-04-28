// adapted from Sucrase (https://github.com/alangpierce/sucrase)

export async function _asyncOptionalChain(ops) {
  let lastAccessLHS = undefined;
  let value = ops[0];
  let i = 1;
  while (i < ops.length) {
    const op = ops[i];
    const fn = ops[i + 1];
    i += 2;
    // by checking for loose equality to `null`, we catch both `null` and `undefined`
    if (op in ['optionalAccess', 'optionalCall'] && value == null) {
      // really we're meaning to return `undefined` as an actual value here, but it saves bytes not to write it
      return;
    }
    if (op in ['access', 'optionalAccess']) {
      lastAccessLHS = value;
      value = await fn(value);
    } else if (op in ['call', 'optionalCall']) {
      value = await fn((...args) => value.call(lastAccessLHS, ...args));
      lastAccessLHS = undefined;
    }
  }
  return value;
}

// Sucrase version:
// async function _asyncOptionalChain(ops) {
//   let lastAccessLHS = undefined;
//   let value = ops[0];
//   let i = 1;
//   while (i < ops.length) {
//     const op = ops[i];
//     const fn = ops[i + 1];
//     i += 2;
//     if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) {
//       return undefined;
//     }
//     if (op === 'access' || op === 'optionalAccess') {
//       lastAccessLHS = value;
//       value = await fn(value);
//     } else if (op === 'call' || op === 'optionalCall') {
//       value = await fn((...args) => value.call(lastAccessLHS, ...args));
//       lastAccessLHS = undefined;
//     }
//   }
//   return value;
// }
