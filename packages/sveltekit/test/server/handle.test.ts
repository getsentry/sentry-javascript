import type { Handle } from '@sveltejs/kit';

import { sentryHandle } from '../../src/server/handle';

function mockEvent(override: Record<string, unknown> = {}): Parameters<Handle>[0]['event'] {
  // From https://github.com/sveltejs/kit/blob/34fd2a5adfc4408984a4eeb5dda38d7073b587b8/packages/kit/src/runtime/server/respond.js#L124
  const event: Parameters<Handle>[0]['event'] = {
    cookies: {} as any,
    fetch: () => Promise.resolve({} as any),
    getClientAddress: () => '',
    locals: {},
    params: { id: '123' },
    platform: {},
    request: {
      headers: {
        get: () => null,
        append: () => {},
        delete: () => {},
        forEach: () => {},
        has: () => false,
        set: () => {},
      },
    } as any,
    route: { id: '/users/[id]' },
    setHeaders: () => {},
    url: new URL('http://localhost:3000/users/123'),
    isDataRequest: false,

    ...override,
  };

  return event;
}

const mockResponse = { status: 200, headers: {}, body: '' } as any;

const syncResolve: Parameters<Handle>[0]['resolve'] = (..._args: unknown[]) => {
  return mockResponse;
};

const asyncResolve: Parameters<Handle>[0]['resolve'] = (..._args: unknown[]) => {
  return new Promise(resolve => {
    resolve(mockResponse);
  });
};

const enum Type {
  Sync = 'sync',
  Async = 'async',
}

describe('handleSentry', () => {
  describe.each([
    [Type.Sync, syncResolve],
    [Type.Async as const, asyncResolve],
  ])('%s resolve', (_name, resolve) => {
    it('should return a response', async () => {
      const response = await sentryHandle({ event: mockEvent(), resolve });

      expect(response.status).toEqual(200);
    });

    it('creates a transaction based on the sentry-trace header', async () => {});

    it('creates a transaction with dynamic sampling context from baggage header', async () => {});

    it('creates a transaction with name from request and route', async () => {});

    it('sets a transaction on the scope', async () => {});

    it('sets the status for ', async () => {});
  });
});
