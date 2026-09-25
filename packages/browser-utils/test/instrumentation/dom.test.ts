/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { instrumentDOM } from '../../src/instrumentation/dom';
import { WINDOW } from '../../src/types';

// @ts-expect-error - idk
WINDOW.XMLHttpRequest = undefined;

describe('instrumentDOM', () => {
  afterEach(() => {
    // @ts-expect-error - idk
    WINDOW.XMLHttpRequest = undefined;
  });

  it('does not throw if XMLHttpRequest is a key on window but not defined', () => {
    expect(instrumentDOM).not.toThrow();
  });

  it('does not leak document click listeners when removeEventListener uses mismatched capture options', () => {
    instrumentDOM();

    const live = {
      capture: new Set<EventListenerOrEventListenerObject>(),
      bubble: new Set<EventListenerOrEventListenerObject>(),
    };
    const patchedAdd = EventTarget.prototype.addEventListener;
    const patchedRemove = EventTarget.prototype.removeEventListener;

    const captureFlag = (options?: boolean | AddEventListenerOptions | EventListenerOptions): boolean =>
      typeof options === 'boolean' ? options : !!options?.capture;

    EventTarget.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (this === document && type === 'click') {
        (captureFlag(options) ? live.capture : live.bubble).add(listener);
      }
      return patchedAdd.call(this, type, listener, options);
    };

    EventTarget.prototype.removeEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) {
      if (this === document && type === 'click') {
        (captureFlag(options) ? live.capture : live.bubble).delete(listener);
      }
      return patchedRemove.call(this, type, listener, options);
    };

    const baseline = live.capture.size + live.bubble.size;

    const never = () => {};
    const onCapture = () => {};
    const onBubble = () => {};

    for (let i = 0; i < 20; i++) {
      document.addEventListener('click', onCapture, true);
      document.addEventListener('click', onBubble);
      document.removeEventListener('click', never);
      document.removeEventListener('click', never);
      document.removeEventListener('click', onCapture, true);
      document.removeEventListener('click', onBubble);
    }

    expect(live.capture.size + live.bubble.size - baseline).toBe(0);
  });
});
