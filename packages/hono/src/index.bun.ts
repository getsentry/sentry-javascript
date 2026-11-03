import { earlyPatchHono } from '@sentry/server-utils';
import { Hono } from 'hono';

earlyPatchHono(Hono);

export { sentry } from './bun/middleware';

export * from '@sentry/bun';

export { init } from './bun/sdk';
