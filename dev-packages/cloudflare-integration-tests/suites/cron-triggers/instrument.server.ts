import { cronTriggersIntegration, defineCloudflareOptions } from '@sentry/cloudflare';
import { monitorSlugs } from './monitorSlugs';

export default defineCloudflareOptions((env: { SENTRY_DSN: string; CACHE_CLIENT?: string }) => ({
  dsn: env.SENTRY_DSN,
  cacheClient: env.CACHE_CLIENT !== 'false',
  integrations: [cronTriggersIntegration({ monitorSlug: cron => monitorSlugs[cron] })],
}));
