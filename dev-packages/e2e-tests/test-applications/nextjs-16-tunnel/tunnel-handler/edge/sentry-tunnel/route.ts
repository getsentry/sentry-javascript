import * as Sentry from '@sentry/nextjs';
import { createSentryTunnelRoute } from '@sentry/nextjs/tunnel';
import { SENTRY_DSN } from '@/sentry-dsn';

export const { POST } = createSentryTunnelRoute({ allowedDsns: [SENTRY_DSN] });

// Each edge route has its own SDK client, so the tests flush this one here.
export async function GET(): Promise<Response> {
  await Sentry.flush();
  return new Response(null, { status: 204 });
}

export const runtime = 'edge';
