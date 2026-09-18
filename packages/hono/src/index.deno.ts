import { earlyPatchHono } from '@sentry/server-utils';
import { Hono } from 'hono';

earlyPatchHono(Hono);

export { sentry } from './deno/middleware';

export * from '@sentry/deno';

export { init } from './deno/sdk';
