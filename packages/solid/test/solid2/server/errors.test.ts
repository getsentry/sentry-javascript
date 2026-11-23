import * as SentryCore from '@sentry/core';
import { renderToString } from '@solidjs/web';
import { createComponent, createMemo, Errored } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { solidServerErrorsIntegration } from '../../../src/solid2/server';

const captureException = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');

describe('solidServerErrorsIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    solidServerErrorsIntegration().setup!({} as SentryCore.Client);
  });

  it('captures an error an <Errored> boundary renders a fallback for', () => {
    const error = new Error('render failed');

    const html = renderToString(() =>
      createComponent(Errored, {
        fallback: () => 'fallback',
        get children() {
          return createMemo(() => {
            throw error;
          })();
        },
      }),
    );

    expect(html).toContain('fallback');
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error, {
      mechanism: {
        type: 'auto.function.solid.server',
        handled: true,
        data: { kind: 'render', handling: 'fallback' },
      },
      captureContext: {
        contexts: {
          solid: expect.objectContaining({ kind: 'render', handling: 'fallback' }),
        },
      },
    });
  });

  it('captures an error that fails the render as unhandled', () => {
    const error = new Error('render crashed');

    expect(() =>
      renderToString(() =>
        createMemo(() => {
          throw error;
        })(),
      ),
    ).toThrow(error);

    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        mechanism: expect.objectContaining({ type: 'auto.function.solid.server', handled: false }),
      }),
    );
  });

  it('does not capture anything for a render without errors', () => {
    renderToString(() => 'ok');

    expect(captureException).not.toHaveBeenCalled();
  });
});
