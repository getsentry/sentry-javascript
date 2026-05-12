import { earlyPatchHono } from './shared/applyPatches';

earlyPatchHono();

export { sentry } from './bun/middleware';

export * from '@sentry/bun';

export { init } from './bun/sdk';
