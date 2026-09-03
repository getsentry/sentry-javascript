import type { Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wrapServerComponentWithSentry } from '../../src/common/wrapServerComponentWithSentry';

const context = { componentRoute: '/rdva', componentType: 'Page' };

function mockActiveSpan(span: Span | undefined): { setStatus: ReturnType<typeof vi.fn> } {
  const setStatus = vi.fn();
  vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue(span ? ({ setStatus } as unknown as Span) : undefined);
  return { setStatus };
}

async function runWrapped(error: unknown): Promise<void> {
  const wrapped = wrapServerComponentWithSentry(async () => {
    throw error;
  }, context);

  await expect(wrapped()).rejects.toBe(error);
}

describe('wrapServerComponentWithSentry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures regular errors and marks the active span as errored', async () => {
    const captureException = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => '');
    const { setStatus } = mockActiveSpan({} as Span);

    const error = new Error('boom');
    await runWrapped(error);

    expect(captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.function.nextjs.server_component' },
    });
    expect(setStatus).toHaveBeenCalledWith({ code: SentryCore.SPAN_STATUS_ERROR, message: 'internal_error' });
  });

  it.each([
    ['not-found', 'NEXT_NOT_FOUND'],
    ['redirect', 'NEXT_REDIRECT;/somewhere'],
    ['hanging prerender promise', 'HANGING_PROMISE_REJECTION'],
    ['prerender interruption', 'NEXT_PRERENDER_INTERRUPTED'],
    ['dynamic server usage', 'DYNAMIC_SERVER_USAGE'],
    ['bailout to client side rendering', 'BAILOUT_TO_CLIENT_SIDE_RENDERING'],
  ])('does not capture %s control flow errors', async (_name, digest) => {
    const captureException = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => '');
    mockActiveSpan({} as Span);

    await runWrapped(Object.assign(new Error('control flow'), { digest }));

    expect(captureException).not.toHaveBeenCalled();
  });

  it.each(['NEXT_NOT_FOUND', 'NEXT_REDIRECT;/somewhere', 'HANGING_PROMISE_REJECTION'])(
    'does not capture the %s control flow error when there is no active span',
    async digest => {
      const captureException = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => '');
      mockActiveSpan(undefined);

      await runWrapped(Object.assign(new Error('control flow'), { digest }));

      expect(captureException).not.toHaveBeenCalled();
    },
  );

  it('still captures regular errors when there is no active span', async () => {
    const captureException = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => '');
    mockActiveSpan(undefined);

    const error = new Error('boom');
    await runWrapped(error);

    expect(captureException).toHaveBeenCalledWith(error, {
      mechanism: { handled: false, type: 'auto.function.nextjs.server_component' },
    });
  });
});
