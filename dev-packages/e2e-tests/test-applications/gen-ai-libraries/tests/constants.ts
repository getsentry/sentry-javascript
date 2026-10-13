export type Runtime = 'node' | 'cloudflare';

export const RUNTIME = (process.env.RUNTIME || 'node') as Runtime;

export const APP = 'gen-ai-libraries';
