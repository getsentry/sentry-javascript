// by checking for loose equality to `null`, we catch both `null` and `undefined`
export const _asyncNullishCoalesce = async (lhs, rhsFn) => (lhs != null ? lhs : rhsFn());

// export async function _asyncNullishCoalesce(lhs, rhsFn) {
//   return lhs != null ? lhs : rhsFn();
// }
