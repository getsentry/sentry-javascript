import { functionToStringIntegration, getCurrentScope, setCurrentClient } from '@sentry/core';
import { afterAll, describe, expect, it } from 'vitest';
import type { MatchedHandler } from '../../../src/integrations/hono/honoTypes';
import { wrapRouteHandlers } from '../../../src/integrations/hono/matchResult';
import { wrapMiddlewareWithSpan } from '../../../src/integrations/hono/wrapMiddlewareSpan';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('sentryOriginalTraps', () => {
  afterAll(() => {
    getCurrentScope().setClient(undefined);
  });

  it('lets functionToStringIntegration unwrap a wrapped Hono middleware', async () => {
    const client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.addIntegration(functionToStringIntegration());

    const middleware = async (_c: unknown, next: () => Promise<void>): Promise<void> => {
      await next();
    };
    const wrapped = wrapMiddlewareWithSpan(middleware);

    expect(wrapped).not.toBe(middleware);
    expect(wrapped.toString()).toBe(middleware.toString());
  });

  it('lets functionToStringIntegration unwrap a wrapped Hono route handler', async () => {
    const client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.addIntegration(functionToStringIntegration());

    const handler = async (_c: unknown, next: () => Promise<void>): Promise<void> => {
      await next();
    };
    const catchAll = (): string => 'fallback';
    const handlers: MatchedHandler[] = [
      [[handler, { method: 'GET', path: '/posts/:id', handler }], {}],
      [[catchAll, { method: 'GET', path: '/posts/*', handler: catchAll }], {}],
    ];
    wrapRouteHandlers(handlers, [false, false]);
    const [[[wrapped]]] = handlers;

    expect(wrapped).not.toBe(handler);
    expect(wrapped.toString()).toBe(handler.toString());
  });
});
