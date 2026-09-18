import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spy on the request/response handlers so we can assert exactly how many times they run.
const requestHandler = vi.fn();
const responseHandler = vi.fn();
vi.mock('../../../src/integrations/hono/middlewareHandlers', () => ({
  requestHandler: (...args: unknown[]) => requestHandler(...args),
  responseHandler: (...args: unknown[]) => responseHandler(...args),
}));

// eslint-disable-next-line import/first
import { createHonoRequestMiddleware } from '../../../src/integrations/hono/createHonoMiddleware';

// Minimal fake Hono context — dedup only needs a stable object to mark, not a real Hono app.
// oxlint-disable-next-line typescript/no-explicit-any
const fakeContext = (): any => ({ req: {} });

describe('createHonoRequestMiddleware — duplicate registration handling', () => {
  beforeEach(() => {
    requestHandler.mockClear();
    responseHandler.mockClear();
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

  it('passes an already-handled context straight through to next()', async () => {
    const context = fakeContext();

    // First middleware handles the request and marks the context.
    await createHonoRequestMiddleware()(context, async () => {});
    requestHandler.mockClear();
    responseHandler.mockClear();

    // A second (duplicate) middleware on the same context must not re-run the handlers.
    let nextCalled = false;
    await createHonoRequestMiddleware()(context, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(requestHandler).not.toHaveBeenCalled();
    expect(responseHandler).not.toHaveBeenCalled();
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
