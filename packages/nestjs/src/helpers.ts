/**
 * Determines if the exception is an expected control flow error.
 * - HttpException errors will have a status property
 * - RpcException errors will have an error property
 *
 * @returns `true` if the exception is expected and should not be reported to Sentry, otherwise `false`.
 */
export function isExpectedError(exception: unknown): boolean {
  if (typeof exception === 'object' && exception !== null) {
    return 'status' in exception || 'error' in exception;
  }
  return false;
}
