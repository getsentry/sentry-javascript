/**
 * @vitest-environment jsdom
 */

import type { Scope } from '@sentry/core';
import { setCurrentClient } from '@sentry/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, onErrorCaptured } from 'vue';
import { captureVueException, withScope } from '../../src';

describe('captureVueException', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('captures a Vue error boundary exception with its local scope', () => {
    const error = 'render failed';
    const captureException = vi.fn((_error: unknown, _hint: unknown, scope?: Scope) => {
      expect(scope?.getScopeData().tags).toEqual({ boundary: 'checkout' });
    });
    setCurrentClient({ captureException } as any);

    const child = defineComponent({
      name: 'Checkout',
      setup() {
        throw error;
      },
      render: () => h('div'),
    });
    const boundary = defineComponent({
      name: 'ErrorBoundary',
      setup() {
        onErrorCaptured((caughtError, instance, info) => {
          withScope(scope => {
            scope.setTag('boundary', 'checkout');
            captureVueException(caughtError, instance, info);
          });

          expect(captureException).toHaveBeenCalledTimes(1);
          return false;
        });

        return () => h(child);
      },
    });
    const app = createApp(boundary);

    app.mount(document.createElement('div'));

    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        captureContext: {
          contexts: {
            vue: expect.objectContaining({
              componentName: '<Checkout>',
              lifecycleHook: 'setup function',
            }),
          },
        },
      }),
      expect.anything(),
    );
    app.unmount();
  });
});
