export type Runtime = 'cloudflare' | 'node' | 'bun';

export const RUNTIME = (process.env.RUNTIME || 'node') as Runtime;

export const APP_NAME = 'hono-4';
