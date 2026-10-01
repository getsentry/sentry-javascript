import type { FastifyReply, FastifyRequest } from './types';

export const INTEGRATION_NAME = 'Fastify' as const;

/**
 * Default function to determine if an error should be sent to Sentry
 *
 * 3xx and 4xx errors are not sent by default.
 */
export function defaultShouldHandleError(error: Error, _request: FastifyRequest, reply: FastifyReply): boolean {
  const statusCode = getReplyStatusCode(error, reply);
  // 3xx and 4xx errors are not sent by default.
  return statusCode >= 500 || statusCode <= 299;
}

/**
 * Fastify runs `onError` hooks before it applies the error's status to the reply
 * (e.g. for a request body that fails to parse), so `reply.statusCode` can still be
 * the default 200. In that case, resolve the status the same way Fastify will.
 */
function getReplyStatusCode(error: Error, reply: FastifyReply): number {
  if (reply.statusCode !== 200) {
    return reply.statusCode;
  }

  const { statusCode, status } = error as { statusCode?: unknown; status?: unknown };
  const errorStatusCode = Number(statusCode || status);
  return errorStatusCode >= 400 ? errorStatusCode : 500;
}
