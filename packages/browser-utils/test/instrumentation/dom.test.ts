/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import { instrumentDOM } from '../../src/instrumentation/dom';
import { WINDOW } from '../../src/types';

// @ts-expect-error - idk
WINDOW.XMLHttpRequest = undefined;

describe('instrumentDOM', () => {
  it('does not leak its handler when removing unregistered listeners', () => {
    const addEventListener = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const removeEventListener = vi.spyOn(EventTarget.prototype, 'removeEventListener');

    try {
      expect(instrumentDOM).not.toThrow();

      const target = new EventTarget();
      const onCapture = (): void => {};
      const onBubble = (): void => {};
      const neverRegistered = (): void => {};
      const addCallsBeforeTest = addEventListener.mock.calls.length;

      for (let i = 0; i < 20; i++) {
        target.addEventListener('click', onCapture, true);
        target.addEventListener('click', onBubble);
        target.removeEventListener('click', neverRegistered);
        target.removeEventListener('click', neverRegistered);
        target.removeEventListener('click', onCapture, true);
        target.removeEventListener('click', onBubble);
      }

      const instrumentedHandlers = addEventListener.mock.calls
        .slice(addCallsBeforeTest)
        .map(([, listener]) => listener)
        .filter(listener => listener !== onCapture && listener !== onBubble);

      expect(instrumentedHandlers).toHaveLength(20);
      for (const handler of instrumentedHandlers) {
        expect(removeEventListener).toHaveBeenCalledWith('click', handler, true);
      }
    } finally {
      addEventListener.mockRestore();
      removeEventListener.mockRestore();
    }
  });
});
