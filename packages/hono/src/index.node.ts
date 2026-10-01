import { earlyPatchHono } from '@sentry/server-utils';
import { Hono } from 'hono';

earlyPatchHono(Hono);

export { sentry } from './node/middleware';

export * from '@sentry/node';

export { init } from './node/sdk';
