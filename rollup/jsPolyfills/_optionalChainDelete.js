const { _optionalChain } = require('./_optionalChain.js');

export const _optionalChainDelete = ops => {
  const result = _optionalChain(ops);
  // by checking for loose equality to `null`, we catch both `null` and `undefined`
  return result == null ? true : result;
};
