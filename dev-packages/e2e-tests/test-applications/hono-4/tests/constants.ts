export type Runtime = 'cloudflare' | 'node' | 'bun';

export const RUNTIME = (process.env.RUNTIME || 'cloudflare') as Runtime;

export const APP_NAME = 'hono-4';
