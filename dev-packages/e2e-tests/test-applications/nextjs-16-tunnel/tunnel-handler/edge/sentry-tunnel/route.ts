import { createSentryTunnelRoute } from '@sentry/nextjs/tunnel';
import { SENTRY_DSN } from '@/sentry-dsn';

export const { POST } = createSentryTunnelRoute({ allowedDsns: [SENTRY_DSN] });

export const runtime = 'edge';
