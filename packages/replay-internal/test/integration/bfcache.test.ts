/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WINDOW } from '../../src/constants';
import type { Replay } from '../../src/integration';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import type { ClickDetector } from '../../src/coreHandlers/handleClick';
import { BASE_TIMESTAMP, mockSdk } from '../index';

function mockClickDetector(): Partial<ClickDetector> & { clearPendingClicksCalled: boolean } {
  return {
    clearPendingClicksCalled: false,
    clearPendingClicks: vi.fn(function (this: any) {
      this.clearPendingClicksCalled = true;
    }),
    addListeners: vi.fn(),
    removeListeners: vi.fn(),
    handleClick: vi.fn(),
    registerMutation: vi.fn(),
    registerScroll: vi.fn(),
    registerClick: vi.fn(),
  };
}

describe('Integration | bfcache', () => {
  let replay: ReplayContainer;
  let integration: Replay;
  let mockDetector: ReturnType<typeof mockClickDetector>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(BASE_TIMESTAMP));

    ({ replay, integration } = await mockSdk({
      replayOptions: {
        slowClickTimeout: 3000,
      },
    }));

    mockDetector = mockClickDetector();
    // Replace the click detector with our mock
    replay.clickDetector = mockDetector as any;

    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();

    vi.runAllTimers();
  });

  afterEach(async () => {
    integration.stop();
    await new Promise(process.nextTick);
    vi.clearAllTimers();
    vi.clearAllMocks();
  });

  describe('pageshow event', () => {
    it('clears pending clicks when page is restored from bfcache', async () => {
      const event = new Event('pageshow') as PageTransitionEvent;
      Object.defineProperty(event, 'persisted', {
        value: true,
        writable: false,
      });

      expect(mockDetector.clearPendingClicksCalled).toBe(false);

      WINDOW.dispatchEvent(event);

      expect(mockDetector.clearPendingClicksCalled).toBe(true);
      expect(mockDetector.clearPendingClicks).toHaveBeenCalledTimes(1);
    });

    it('does not clear pending clicks on regular pageshow', async () => {
      const event = new Event('pageshow') as PageTransitionEvent;
      Object.defineProperty(event, 'persisted', {
        value: false,
        writable: false,
      });

      expect(mockDetector.clearPendingClicksCalled).toBe(false);

      WINDOW.dispatchEvent(event);

      expect(mockDetector.clearPendingClicksCalled).toBe(false);
      expect(mockDetector.clearPendingClicks).not.toHaveBeenCalled();
    });
  });

  describe('pagehide event', () => {
    it('clears pending clicks when page enters bfcache', async () => {
      const event = new Event('pagehide') as PageTransitionEvent;
      Object.defineProperty(event, 'persisted', {
        value: true,
        writable: false,
      });

      expect(mockDetector.clearPendingClicksCalled).toBe(false);

      WINDOW.dispatchEvent(event);

      expect(mockDetector.clearPendingClicksCalled).toBe(true);
      expect(mockDetector.clearPendingClicks).toHaveBeenCalledTimes(1);
    });

    it('does not clear pending clicks on regular pagehide', async () => {
      const event = new Event('pagehide') as PageTransitionEvent;
      Object.defineProperty(event, 'persisted', {
        value: false,
        writable: false,
      });

      expect(mockDetector.clearPendingClicksCalled).toBe(false);

      WINDOW.dispatchEvent(event);

      expect(mockDetector.clearPendingClicksCalled).toBe(false);
      expect(mockDetector.clearPendingClicks).not.toHaveBeenCalled();
    });
  });
});
