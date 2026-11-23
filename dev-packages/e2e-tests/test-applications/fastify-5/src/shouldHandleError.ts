import type { fastifyIntegration } from './sentry';

type ShouldHandleError = NonNullable<NonNullable<Parameters<typeof fastifyIntegration>[0]>['shouldHandleError']>;

export const shouldHandleError: ShouldHandleError = (_error, request, reply) => {
  if (request.routeOptions?.url?.includes('/test-error-not-captured')) {
    return false;
  }

  if (request.routeOptions?.url?.includes('/test-error-ignored') && reply.statusCode === 500) {
    return false;
  }

  return true;
};
