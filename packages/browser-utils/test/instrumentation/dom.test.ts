/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { instrumentDOM } from '../../src/instrumentation/dom';
import { WINDOW } from '../../src/types';

// @ts-expect-error - idk
WINDOW.XMLHttpRequest = undefined;

describe('instrumentDOM', () => {
  const { addEventListener: nativeAdd, removeEventListener: nativeRemove } = EventTarget.prototype;

  // `instrumentDOM` patches `EventTarget.prototype` and isn't idempotent, so restore the native methods after every test.
  afterEach(() => {
    EventTarget.prototype.addEventListener = nativeAdd;
    EventTarget.prototype.removeEventListener = nativeRemove;
  });

  it('does not throw if XMLHttpRequest is a key on window but not defined', () => {
    expect(instrumentDOM).not.toThrow();
  });

  it('does not leak document click listeners when removeEventListener uses mismatched capture options', () => {
    const documentClickListeners = { capture: new Set<unknown>(), bubble: new Set<unknown>() };

    const phase = (options?: boolean | EventListenerOptions): Set<unknown> =>
      (typeof options === 'boolean' ? options : !!options?.capture)
        ? documentClickListeners.capture
        : documentClickListeners.bubble;

    // Installed before `instrumentDOM` so these sit underneath the SDK and also see the listeners it attaches itself.
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (this === document && type === 'click') {
        phase(options).add(listener);
      }
      return nativeAdd.call(this, type, listener, options);
    };

    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      if (this === document && type === 'click') {
        phase(options).delete(listener);
      }
      return nativeRemove.call(this, type, listener, options);
    };

    instrumentDOM();

    // baseline listenercount is 1 which comes from the SDK's global click handler registered
    // in instrumentDOM().
    const baseline = documentClickListeners.capture.size + documentClickListeners.bubble.size;

    const never = (): void => {};
    const onCapture = (): void => {};
    const onBubble = (): void => {};

    for (let i = 0; i < 20; i++) {
      document.addEventListener('click', onCapture, true);
      document.addEventListener('click', onBubble);
      document.removeEventListener('click', never);
      document.removeEventListener('click', never);
      document.removeEventListener('click', onCapture, true);
      document.removeEventListener('click', onBubble);
    }

    expect(documentClickListeners.capture.size + documentClickListeners.bubble.size - baseline).toBe(0);
  });
});
