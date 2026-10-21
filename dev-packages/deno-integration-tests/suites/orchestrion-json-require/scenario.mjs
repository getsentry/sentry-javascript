// Spawned by test.ts via `deno run`.
//
// Importing `@sentry/deno/import` registers the orchestrion module hook. No
// module here is instrumented — the point is that installing the hook at all
// must not change how `require()` loads JSON.
import '@sentry/deno/import';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { answer } = require('./fixture.cjs');

// eslint-disable-next-line no-console
console.log(`SCENARIO answer=${answer}`);
