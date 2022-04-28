// adapted from Sucrase (https://github.com/alangpierce/sucrase)

export function _nullishCoalesce(lhs, rhsFn) {
  // by checking for loose equality to `null`, we catch both `null` and `undefined`
  return lhs != null ? lhs : rhsFn();
}

// Sucrase version
// function _nullishCoalesce(lhs, rhsFn) {
//   if (lhs != null) {
//     return lhs;
//   } else {
//     return rhsFn();
//   }
// }
