import { setAsyncContextStrategy, withIsolationScope } from '@sentry/core';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

// Spy on the request/response handlers so we can assert exactly how many times they run.
const requestHandler = vi.fn();
const responseHandler = vi.fn();
const captureContextError = vi.fn();
vi.mock('../../../src/integrations/hono/middlewareHandlers', () => ({
  requestHandler: (...args: unknown[]) => requestHandler(...args),
  responseHandler: (...args: unknown[]) => responseHandler(...args),
  captureContextError: (...args: unknown[]) => captureContextError(...args),
}));

// eslint-disable-next-line import/first
import { setAsyncLocalStorageAsyncContextStrategy } from '../../../src/async-context';
// eslint-disable-next-line import/first
import { createHonoRequestMiddleware } from '../../../src/integrations/hono/createHonoMiddleware';

// Minimal fake Hono context — dedup only needs a stable object to mark, not a real Hono app.
// oxlint-disable-next-line typescript/no-explicit-any
const fakeContext = (): any => ({ req: {} });

describe('createHonoRequestMiddleware — duplicate registration handling', () => {
  beforeEach(() => {
    requestHandler.mockClear();
    responseHandler.mockClear();
    captureContextError.mockClear();
  });

  it('runs request/response handling exactly once when two Sentry middlewares wrap the same request', async () => {
    const outer = createHonoRequestMiddleware();
    const inner = createHonoRequestMiddleware();
    const context = fakeContext();

    // Onion order: outer → inner → handler → inner → outer.
    await outer(context, async () => {
      await inner(context, async () => {});
    });

    expect(requestHandler).toHaveBeenCalledTimes(1);
    expect(responseHandler).toHaveBeenCalledTimes(1);
  });

  it('passes a deduplicated request straight through to next()', async () => {
    const context = fakeContext();
    const handler = vi.fn();

    await createHonoRequestMiddleware()(context, async () => {
      await createHonoRequestMiddleware()(context, handler);
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(requestHandler).toHaveBeenCalledTimes(1);
    expect(responseHandler).toHaveBeenCalledTimes(1);
  });

  it('handles sequential requests sharing one isolation scope independently', async () => {
    const userShouldHandleError = (): boolean => true;
    const auto = createHonoRequestMiddleware();
    const manual = createHonoRequestMiddleware({ shouldHandleError: userShouldHandleError });
    setAsyncLocalStorageAsyncContextStrategy();
    onTestFinished(() => setAsyncContextStrategy(undefined));

    await withIsolationScope(async () => {
      const firstContext = fakeContext();
      await auto(firstContext, async () => {
        await manual(firstContext, async () => {});
      });

      const secondContext = fakeContext();
      await auto(secondContext, async () => {});

      expect(requestHandler).toHaveBeenCalledTimes(2);
      expect(responseHandler).toHaveBeenNthCalledWith(1, firstContext, userShouldHandleError);
      expect(responseHandler).toHaveBeenNthCalledWith(2, secondContext, undefined);
    });
  });

  it('handles independent requests independently (marker is per-context)', async () => {
    const middleware = createHonoRequestMiddleware();

    await middleware(fakeContext(), async () => {});
    await middleware(fakeContext(), async () => {});

    expect(requestHandler).toHaveBeenCalledTimes(2);
    expect(responseHandler).toHaveBeenCalledTimes(2);
  });

  it("uses a deduplicated middleware's shouldHandleError over the outer (auto) default", async () => {
    const userShouldHandleError = (): boolean => true;
    // Outer middleware mirrors the auto-instrumentation: registered first, no shouldHandleError.
    const auto = createHonoRequestMiddleware();
    // Inner middleware mirrors a manual `sentry({ shouldHandleError })`: deduplicated behind `auto`.
    const manual = createHonoRequestMiddleware({ shouldHandleError: userShouldHandleError });
    const context = fakeContext();

    await auto(context, async () => {
      await manual(context, async () => {});
    });

    // The request is still handled exactly once, but with the user's callback, not the default.
    expect(responseHandler).toHaveBeenCalledTimes(1);
    expect(responseHandler).toHaveBeenCalledWith(context, userShouldHandleError);
  });
});
