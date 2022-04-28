const { _asyncOptionalChain } = require('./_asyncOptionalChain.js');

export const _asyncOptionalChainDelete = async ops => {
  const result = await _asyncOptionalChain(ops);
  // by checking for loose equality to `null`, we catch both `null` and `undefined`
  return result == null ? true : result;
};
