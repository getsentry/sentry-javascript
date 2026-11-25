import { getRuntime } from '@sentry-internal/test-utils';

export const RUNTIME = getRuntime();

export const APP_NAME = 'astro-6';

// `wrangler dev` replaces the `accept-encoding` header that Chromium sends.
export const BROWSER_ACCEPT_ENCODING = RUNTIME === 'cloudflare' ? 'br, gzip' : 'gzip, deflate, br, zstd';
