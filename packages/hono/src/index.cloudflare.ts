import { earlyPatchHono } from './shared/applyPatches';

earlyPatchHono();

export { sentry } from './cloudflare/middleware';

export * from '@sentry/cloudflare';
