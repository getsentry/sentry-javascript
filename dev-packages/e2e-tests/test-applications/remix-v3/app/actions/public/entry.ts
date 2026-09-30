import * as Sentry from '@sentry/remix/v3/client';
import { createElement, run } from 'remix/ui';

import { throwError } from './throw-error.ts';

// Not Node. The asset server substitutes this when it compiles the module, from the `define` map in
// `app/assets.ts`.
declare const process: { env: Record<string, string | undefined> };

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3061/',
  tracesSampleRate: 1.0,
});

export const app = run({
  async loadModule(moduleUrl, exportName) {
    const mod = await import(moduleUrl);
    return mod[exportName];
  },
});

function Boom(): () => never {
  return () => {
    throw new Error('Component render failed');
  };
}

document.addEventListener('click', event => {
  const id = (event.target as HTMLElement | null)?.id;
  if (id === 'component-error') {
    void app.frames.top.replace(createElement(Boom, {}));
  }
  if (id === 'throw-error') {
    throwError();
  }
});
