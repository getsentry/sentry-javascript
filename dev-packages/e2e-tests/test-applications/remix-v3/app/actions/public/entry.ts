import * as Sentry from '@sentry/browser';
import { run } from 'remix/ui';

import { throwError } from './throw-error.ts';

// `@sentry/browser` directly, since `@sentry/remix/v3/client` does not export `init` until the
// browser SDK lands.
Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3061/',
});

document.getElementById('throw-error')?.addEventListener('click', () => {
  throwError();
});

export const app = run({
  async loadModule(moduleUrl, exportName) {
    let mod = await import(moduleUrl);
    return mod[exportName];
  },
});
