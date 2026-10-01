import * as Sentry from '@sentry/remix/v3/client';
import { createElement, run } from 'remix/ui';

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

// The runtime sends a render error to the event target `run()` returns and does not rethrow, so
// `window.onerror` never sees it. This listener is the only way the SDK learns about it.
Sentry.captureRuntimeErrors(app);

function Boom(): () => never {
  return () => {
    throw new Error('Component render failed');
  };
}

document.addEventListener('click', event => {
  if ((event.target as HTMLElement | null)?.id === 'component-error') {
    void app.frames.top.replace(createElement(Boom, {}));
  }
});
