// originally from Sucrase (https://github.com/alangpierce/sucrase)

import { _optionalChain } from './_optionalChain';

export function _optionalChainDelete(ops) {
  const result = _optionalChain(ops);
  // by checking for loose equality to `null`, we catch both `null` and `undefined`
  return result == null ? true : result;
}
