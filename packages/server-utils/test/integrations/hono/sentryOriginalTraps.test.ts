import { functionToStringIntegration, getCurrentScope, setCurrentClient } from '@sentry/core';
import { afterAll, describe, expect, it } from 'vitest';
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
});
