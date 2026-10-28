import * as Sentry from '@sentry/nextjs';

// Without this Next.js prerenders the route at build time, where `init` creates no client and the log is dropped.
export const dynamic = 'force-dynamic';

export async function GET() {
  Sentry.logger.info('e2e server log', { 'e2e.attr': 'value' });
  return Response.json({ ok: true });
}
