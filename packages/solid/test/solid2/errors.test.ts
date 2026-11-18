import * as SentryCore from '@sentry/core';
import { createComponent, createMemo, createRenderEffect, createRoot, createSignal, Errored, flush } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { solidErrorsIntegration } from '../../src/solid2';

const captureException = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');

function renderWithBoundary(error: Error): { fail: () => void; output: () => unknown; dispose: () => void } {
  const [shouldFail, setShouldFail] = createSignal(false);
  let output: unknown;
  let dispose = (): void => {};

  createRoot(d => {
    dispose = d;
    const view = createMemo(() => {
      if (shouldFail()) throw error;
      return 'ok';
    });
    const boundary = createComponent(Errored, {
      fallback: () => 'fallback',
      get children() {
        return view();
      },
    });
    createRenderEffect(
      () => {
        let value: unknown = boundary;
        while (typeof value === 'function') value = value();
        return value;
      },
      value => {
        output = value;
      },
    );
  });
  flush();

  return {
    fail: () => {
      setShouldFail(true);
      flush();
    },
    output: () => output,
    dispose,
  };
}

describe('solidErrorsIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    solidErrorsIntegration().setup!({} as SentryCore.Client);
  });

  it('captures an error caught by an <Errored> boundary', () => {
    const error = new Error('boom');
    const { fail, output, dispose } = renderWithBoundary(error);
    expect(output()).toBe('ok');

    fail();

    expect(output()).toBe('fallback');
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error, {
      mechanism: { type: 'auto.function.solid.error_boundary', handled: true },
      captureContext: { contexts: { solid: { owner_path: expect.any(Array), boundary_path: undefined } } },
    });
    dispose();
  });

  it('does not capture anything when no error is thrown', () => {
    const { output, dispose } = renderWithBoundary(new Error('never thrown'));

    expect(output()).toBe('ok');
    expect(captureException).not.toHaveBeenCalled();
    dispose();
  });
});
