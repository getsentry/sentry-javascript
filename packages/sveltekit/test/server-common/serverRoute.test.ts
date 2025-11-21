import * as SentryCore from '@sentry/core';
import type { NumericRange, type RequestEvent } from '@sveltejs/kit';
import { error, redirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  wrapServerRouteWithSentry,
} from '../../src/server';

describe('wrapServerRouteWithSentry', () => {
  const originalRouteHandler = vi.fn();

  const getRequestEventMock = () =>
    ({
      request: {
        method: 'GET',
      },
      route: {
        id: '/api/users/:id',
      },
    }) as RequestEvent;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('wraps a server route span around the original server route handler', () => {
    const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');

    it('assigns the route id as name if available', () => {
      const wrappedRouteHandler = wrapServerRouteWithSentry(originalRouteHandler);

      wrappedRouteHandler(getRequestEventMock());

      expect(startSpanSpy).toHaveBeenCalledWith(
        {
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.sveltekit',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          },
          name: 'GET /api/users/:id',
          onlyIfParent: true,
          op: 'function.sveltekit.server.get',
        },
        expect.any(Function),
      );

      expect(originalRouteHandler).toHaveBeenCalledTimes(1);
    });

    it('falls back to a generic name if route id is not available', () => {
      const wrappedRouteHandler = wrapServerRouteWithSentry(originalRouteHandler);

      wrappedRouteHandler({ ...getRequestEventMock(), route: undefined } as unknown as RequestEvent);

      expect(startSpanSpy).toHaveBeenCalledWith(
        {
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.sveltekit',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          },
          name: 'GET Server Route',
          onlyIfParent: true,
          op: 'function.sveltekit.server.get',
        },
        expect.any(Function),
      );

      expect(originalRouteHandler).toHaveBeenCalledTimes(1);
    });
  });

  const captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
  describe('captures server route errors', () => {
    it('captures and rethrows normal server route error', async () => {
      const error = new Error('Server Route Error');

      const wrappedRouteHandler = wrapServerRouteWithSentry(() => {
        throw error;
      });

      await expect(async () => {
        await wrappedRouteHandler(getRequestEventMock());
      }).rejects.toThrowError('Server Route Error');

      expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
        mechanism: { type: 'auto.function.sveltekit.server_route', handled: false },
      });
    });

    it.each([500, 501, 599])('captures and rethrows %s error() calls', async status => {
      const wrappedRouteHandler = wrapServerRouteWithSentry(() => {
        error(status as NumericRange<400, 599>, `error(${status}) error`);
      });

      await expect(async () => {
        await wrappedRouteHandler(getRequestEventMock());
      }).rejects.toThrow();

      expect(captureExceptionSpy).toHaveBeenCalledWith(
        { body: { message: `error(${status}) error` }, status },
        {
          mechanism: {
            type: 'auto.function.sveltekit.server_route',
            handled: false,
          },
        },
      );
    });

    it.each([400, 401, 499])("doesn't capture but rethrows %s error() calls", async status => {
      const wrappedRouteHandler = wrapServerRouteWithSentry(() => {
        error(status as NumericRange<400, 599>, `error(${status}) error`);
      });

      await expect(async () => {
        await wrappedRouteHandler(getRequestEventMock());
      }).rejects.toThrow();

      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it.each([300, 301, 308])("doesn't capture redirect(%s) calls", async status => {
      const wrappedRouteHandler = wrapServerRouteWithSentry(() => {
        redirect(status as NumericRange<300, 308>, '/redirect');
      });

      await expect(async () => {
        await wrappedRouteHandler(getRequestEventMock());
      }).rejects.toThrow();

      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });
  });
});
