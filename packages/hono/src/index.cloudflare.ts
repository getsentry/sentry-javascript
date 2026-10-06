import { earlyPatchHono } from '@sentry/server-utils/no-diagnostic-channels';
import { Hono } from 'hono';

earlyPatchHono(Hono);

export { sentry } from './cloudflare/middleware';

export * from '@sentry/cloudflare';
