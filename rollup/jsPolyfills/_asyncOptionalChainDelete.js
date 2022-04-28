// originally from Sucrase (https://github.com/alangpierce/sucrase)

import { _asyncOptionalChain } from './_asyncOptionalChain';

export async function _asyncOptionalChainDelete(ops) {
  const result = await _asyncOptionalChain(ops);
  // by checking for loose equality to `null`, we catch both `null` and `undefined`
  return result == null ? true : result;
}
