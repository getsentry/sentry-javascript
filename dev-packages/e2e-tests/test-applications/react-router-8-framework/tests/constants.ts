export type Runtime = 'node' | 'bun' | 'deno' | 'cloudflare';

export const RUNTIME = (process.env.RUNTIME || 'node') as Runtime;

export const APP_NAME = 'react-router-8-framework';
