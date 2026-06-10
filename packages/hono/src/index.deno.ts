import { earlyPatchHono } from './shared/applyPatches';

earlyPatchHono();

export { sentry } from './deno/middleware';

export * from '@sentry/deno';
