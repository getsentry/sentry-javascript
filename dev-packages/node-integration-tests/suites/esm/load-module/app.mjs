import { loadModule } from '@sentry/core/server';

// The default `existingModule` argument must not reference a CJS-only binding: default
// parameters are evaluated before the function body, so a bare `module` would throw
// outside the try/catch that is supposed to make this helper degrade gracefully.
loadModule('node:path');
