/**
 * Just an Error object with arbitrary attributes attached to it.
 */
export interface ExtendedError extends Error {
  // TODO: fix in v11, convert any to unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
