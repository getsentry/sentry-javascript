// Note: These tests run the handler in Node.js, which has some differences to the cloudflare workers runtime.
// Although this is not ideal, this is the best we can do until we have a better way to test cloudflare workers.

import { beforeEach, describe, expect, test, vi } from 'vitest';

import { withSentry } from '../src/handler';

const MOCK_ENV = {
  SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337',
};

describe('sentryPagesPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('gets env from handler', async () => {
    const handler = {
      fetch(_request, _env, _context) {
        return new Response('test');
      },
    } satisfies ExportedHandler;

    const optionsCallback = vi.fn().mockReturnValue({});

    const wrappedHandler = withSentry(optionsCallback, handler);
    await wrappedHandler.fetch(new Request('https://example.com'), MOCK_ENV, createMockExecutionContext());

    expect(optionsCallback).toHaveBeenCalledTimes(1);
    expect(optionsCallback).toHaveBeenLastCalledWith(MOCK_ENV);
  });

  test('passes through the response from the handler', async () => {
    const response = new Response('test');
    const handler = {
      async fetch(_request, _env, _context) {
        return response;
      },
    } satisfies ExportedHandler;

    const wrappedHandler = withSentry(() => ({}), handler);
    const result = await wrappedHandler.fetch(
      new Request('https://example.com'),
      MOCK_ENV,
      createMockExecutionContext(),
    );

    expect(result).toBe(response);
  });
});

function createMockExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}
