// by checking for loose equality to `null`, we catch both `null` and `undefined`
export const _nullishCoalesce = (lhs, rhsFn) => (lhs != null ? lhs : rhsFn());
