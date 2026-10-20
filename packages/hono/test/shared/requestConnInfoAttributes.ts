import * as SentryCore from '@sentry/core';
import { Hono, type MiddlewareHandler } from 'hono';
import { vi } from 'vitest';

/**
 * Sends one request through `middleware` inside a root span, with `userInfo` collection on, and
 * gives the root span attributes. `env` is what the runtime adapter passes to `app.fetch`.
 */
export async function requestConnInfoAttributes(
  middleware: MiddlewareHandler,
  { env, headers }: { env?: unknown; headers?: Record<string, string> },
): Promise<Record<string, unknown>> {
  const app = new Hono();
  app.use(middleware);
  app.get('/', c => c.text('ok'));

  const fakeClient = { getDataCollectionOptions: () => ({ userInfo: true }) };
  const getClientSpy = vi.spyOn(SentryCore, 'getClient').mockReturnValue(fakeClient as unknown as SentryCore.Client);
  const rootSpan = new SentryCore.SentrySpan({ name: 'GET /' });

  try {
    await SentryCore.withActiveSpan(rootSpan, () => app.request('/', { headers }, env));
  } finally {
    getClientSpy.mockRestore();
  }

  return SentryCore.spanToJSON(rootSpan).attributes ?? {};
}
