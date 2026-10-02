import { beforeAll, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/browser', () => ({ captureException: (...args: unknown[]) => captureException(...args) }));

const { captureRuntimeErrors, instrumentClientRuntime } = await import('../../src/v3/client/errors');
const { tracingChannel } = await import('../../src/v3/client/diagnosticsChannelShim');

/** Stands in for the `AppRuntime` that `run()` returns. */
function fakeApp(): EventTarget {
  return new EventTarget();
}

// There is no `ErrorEvent` in this environment. The SDK only reads `.error` off the event, which is
// where the runtime puts the thrown value.
function errorEvent(error: unknown): Event {
  return Object.assign(new Event('error'), { error });
}

describe('captureRuntimeErrors', () => {
  beforeAll(() => {
    // Called twice because `init()` may run more than once. Two guards make that safe, the subscribe
    // once flag and the `attached` WeakSet; this pins the outcome, not either one on its own.
    instrumentClientRuntime();
    instrumentClientRuntime();
  });

  it('reports one error per dispatch, however often instrumentation was set up', () => {
    captureException.mockClear();
    const app = fakeApp();
    tracingChannel('orchestrion:@remix-run/ui:run').end.publish({ result: app });

    const error = new Error('render failed');
    app.dispatchEvent(errorEvent(error));

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.ui.remix_v3' },
    });
  });

  it('attaches only once to the same app', () => {
    captureException.mockClear();
    const app = fakeApp();
    captureRuntimeErrors(app);
    captureRuntimeErrors(app);

    app.dispatchEvent(errorEvent(new Error('render failed')));

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('falls back to the event when it carries no error', () => {
    captureException.mockClear();
    const app = fakeApp();
    captureRuntimeErrors(app);

    const event = new Event('error');
    app.dispatchEvent(event);

    expect(captureException).toHaveBeenCalledWith(event, expect.anything());
  });
});
