export type Runtime = 'cloudflare' | 'node' | 'bun' | 'deno';

export const RUNTIME = (process.env.RUNTIME || 'deno') as Runtime;

export const APP_NAME = 'hono-4';
