import type { FastifyReply, FastifyRequest } from './types';

export const INTEGRATION_NAME = 'Fastify';

/**
 * Default function to determine if an error should be sent to Sentry
 *
 * 3xx and 4xx errors are not sent by default.
 */
export function defaultShouldHandleError(_error: Error, _request: FastifyRequest, reply: FastifyReply): boolean {
  const statusCode = reply.statusCode;
  // 3xx and 4xx errors are not sent by default.
  return statusCode >= 500 || statusCode <= 299;
}
