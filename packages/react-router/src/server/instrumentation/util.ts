/**
 * Gets the op name for a request based on whether it's a loader or action request.
 * @param pathName The URL pathname to check
 * @param requestMethod The HTTP request method
 */
export function getOpName(pathName: string, requestMethod: string): string {
  return isLoaderRequest(pathName, requestMethod)
    ? 'function.react_router.loader'
    : isActionRequest(pathName, requestMethod)
      ? 'function.react_router.action'
      : 'function.react_router';
}

/**
 * Gets the span name for a request based on whether it's a loader or action request.
 * @param pathName The URL pathname to check
 * @param requestMethod The HTTP request method
 */
export function getSpanName(pathName: string, requestMethod: string): string {
  return isLoaderRequest(pathName, requestMethod)
    ? 'Executing Server Loader'
    : isActionRequest(pathName, requestMethod)
      ? 'Executing Server Action'
      : 'Unknown Data Request';
}

/**
 * Checks if the request is a server loader request
 * @param pathname The URL pathname to check
 * @param requestMethod The HTTP request method
 */
export function isLoaderRequest(pathname: string, requestMethod: string): boolean {
  return isDataRequest(pathname) && requestMethod === 'GET';
}

/**
 * Checks if the request is a server action request
 * @param pathname The URL pathname to check
 * @param requestMethod The HTTP request method
 */
export function isActionRequest(pathname: string, requestMethod: string): boolean {
  return isDataRequest(pathname) && requestMethod === 'POST';
}

/**
 * Checks if the request is a react-router data request
 * @param pathname The URL pathname to check
 */
export function isDataRequest(pathname: string): boolean {
  return pathname.endsWith('.data');
}

export const SEMANTIC_ATTRIBUTE_SENTRY_OVERWRITE = 'sentry.overwrite-route';
