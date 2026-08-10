/**
 * Determines if a thrown "error" is a redirect Response which Solid Start users can throw to redirect to another route.
 * see: https://docs.solidjs.com/solid-router/reference/data-apis/response-helpers#redirect
 * @param error the potential redirect error
 */
export function isRedirect(error: unknown): boolean {
  if (error == null || !(error instanceof Response)) {
    return false;
  }

  const hasValidLocation = typeof error.headers.get('location') === 'string';
  const hasValidStatus = error.status >= 300 && error.status <= 308;
  return hasValidLocation && hasValidStatus;
}
