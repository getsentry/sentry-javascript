import { type DsnComponents, handleTunnelRequest, makeDsn } from '@sentry/core';

/**
 * Creates a Sentry tunnel handler for TanStack Start.
 *
 * @param allowedDsns - Array of DSN strings that this tunnel will accept.
 * @returns TanStack Start compatible request handler
 *
 * @example
 * const handler = createSentryTunnelHandler([process.env.SENTRY_DSN])
 * export const Route = createFileRoute('/tunnel')({
 *   server: { handlers: { POST: handler } }
 * })
 */
export function createTunnelHandler(
  allowedDsns: Array<string>,
): (args: { request: Request }) => Promise<Response> {
  const allowedDsnComponents = allowedDsns.map(makeDsn).filter((c): c is DsnComponents => c !== undefined);

  if (allowedDsnComponents.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('Sentry tunnel: No valid DSNs provided. All requests will be rejected.');
  }

  return async ({ request }: { request: Request }): Promise<Response> => {
    try {
      const body = await request.text();
      const result = await handleTunnelRequest(body, allowedDsnComponents);

      return new Response(result.body, {
        status: result.status,
        headers: { 'Content-Type': result.contentType },
      });
    } catch (error) {
      return new Response('Internal server error', { status: 500 });
    }
  };
}
