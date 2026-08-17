/**
 * @vitest-environment jsdom
 */

import type * as BrowserUtils from '@sentry/browser-utils';
import type { Scope, SessionContext, User } from '@sentry/core/browser';
import * as SentryCore from '@sentry/core/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserSessionIntegration } from '../../src/integrations/browsersession';
import type { PersistedSession } from '../../src/session/persistence';
import { SESSION_STORAGE_KEY } from '../../src/session/persistence';

const scopeHolder = vi.hoisted(() => ({ current: undefined as unknown as FakeIsolationScope }));

const historyHandlers = vi.hoisted(() => ({ current: [] as Array<(data: { from?: string; to?: string }) => void> }));

const domHandlers = vi.hoisted(() => ({ current: [] as Array<() => void> }));

vi.mock('@sentry/core/browser', async importActual => {
  const actual = (await importActual()) as typeof SentryCore;
  return {
    ...actual,
    // The integration reads the session it gets back, so the mock has to produce a real one.
    // `makeSession` narrows away `started`, which the integration legitimately passes when resuming.
    startSession: vi.fn((context?: SessionContext) =>
      actual.makeSession(context as Parameters<typeof actual.makeSession>[0]),
    ),
    captureSession: vi.fn(),
    getIsolationScope: () => scopeHolder.current,
  };
});

// Capture the registered history and dom handlers so navigation and user activity can be driven
// deterministically, while keeping the real `whenIdleOrHidden` (the tests drive its timers/events
// directly).
vi.mock('@sentry/browser-utils', async importActual => {
  const actual = (await importActual()) as typeof BrowserUtils;
  return {
    ...actual,
    addHistoryInstrumentationHandler: (handler: (data: { from?: string; to?: string }) => void) => {
      historyHandlers.current.push(handler);
    },
    addClickKeypressInstrumentationHandler: (handler: () => void) => {
      domHandlers.current.push(handler);
    },
  };
});

function navigate(from: string, to: string): void {
  historyHandlers.current.forEach(handler => handler({ from, to }));
}

function interact(): void {
  domHandlers.current.forEach(handler => handler());
}

function getStoredSession(): PersistedSession | undefined {
  const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  return stored ? (JSON.parse(stored) as PersistedSession) : undefined;
}

interface FakeIsolationScope {
  getUser: () => User | undefined;
  addScopeListener: (cb: (scope: Scope) => void) => void;
  setUser: (user: User | undefined) => void;
}

/**
 * Minimal isolation-scope stand-in so we can drive the integration's scope listener
 * deterministically (and in isolation from the global scope) across tests.
 */
function createFakeIsolationScope(initialUser?: User): FakeIsolationScope {
  let user = initialUser;
  let listener: ((scope: Scope) => void) | undefined;
  return {
    getUser: () => user,
    addScopeListener: cb => {
      listener = cb;
    },
    setUser: nextUser => {
      user = nextUser;
      listener?.({ getUser: () => user } as Scope);
    },
  };
}

function setVisibilityState(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

function setupBrowserSession(options?: Parameters<typeof browserSessionIntegration>[0]): void {
  const integration = browserSessionIntegration(options);
  integration.setupOnce?.();
}

describe('browserSessionIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // `requestIdleCallback` is unavailable in jsdom, so `whenIdleOrHidden` falls back to
    // `setTimeout` which we drive via fake timers to simulate the browser going idle.
    delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
    setVisibilityState('visible');
    scopeHolder.current = createFakeIsolationScope();
    historyHandlers.current = [];
    domHandlers.current = [];
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts the session synchronously but defers the initial capture until the browser is idle', () => {
    setupBrowserSession({ lifecycle: 'page' });

    expect(SentryCore.startSession).toHaveBeenCalledTimes(1);
    expect(SentryCore.startSession).toHaveBeenCalledWith({ ignoreDuration: true });

    // The send must not happen synchronously during init.
    expect(SentryCore.captureSession).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(SentryCore.captureSession).toHaveBeenCalledTimes(1);
  });

  it('captures the session immediately when the page is already hidden', () => {
    setVisibilityState('hidden');

    setupBrowserSession({ lifecycle: 'page' });

    expect(SentryCore.captureSession).toHaveBeenCalledTimes(1);
  });

  it('flushes the deferred session when the page is hidden before the browser goes idle', () => {
    setupBrowserSession({ lifecycle: 'page' });
    expect(SentryCore.captureSession).not.toHaveBeenCalled();

    setVisibilityState('hidden');
    window.dispatchEvent(new Event('visibilitychange'));
    expect(SentryCore.captureSession).toHaveBeenCalledTimes(1);

    // The idle fallback must not send the session a second time.
    vi.runAllTimers();
    expect(SentryCore.captureSession).toHaveBeenCalledTimes(1);
  });

  it('does not send a separate envelope for user data set before the initial capture', () => {
    setupBrowserSession({ lifecycle: 'page' });

    // User set during page load (before idle): folded into the deferred initial session,
    // so it must not trigger its own send.
    scopeHolder.current.setUser({ id: '1337' });
    expect(SentryCore.captureSession).not.toHaveBeenCalled();

    vi.runAllTimers();

    // Only the (single) deferred initial session is sent.
    expect(SentryCore.captureSession).toHaveBeenCalledTimes(1);
  });

  it('captures an update when user data changes after the initial capture', () => {
    setupBrowserSession({ lifecycle: 'page' });
    vi.runAllTimers();
    expect(SentryCore.captureSession).toHaveBeenCalledTimes(1);

    // User set after the initial session was sent: emits a dedicated update envelope.
    scopeHolder.current.setUser({ id: '1337' });
    expect(SentryCore.captureSession).toHaveBeenCalledTimes(2);
  });

  it('does not re-send the navigation session when navigation happens before the deferred initial capture', () => {
    setupBrowserSession({ lifecycle: 'route' });

    // The initial capture is deferred, so nothing is sent synchronously.
    expect(SentryCore.captureSession).not.toHaveBeenCalled();

    // User navigates before the browser goes idle: a new session is started and sent.
    navigate('/initial', '/next');
    expect(SentryCore.startSession).toHaveBeenCalledTimes(2);
    expect(SentryCore.captureSession).toHaveBeenCalledTimes(1);

    // The deferred idle callback now fires. Since the navigation already sent the current
    // session, the deferred capture must not re-send it.
    vi.runAllTimers();
    expect(SentryCore.captureSession).toHaveBeenCalledTimes(1);
  });

  it('still captures a session on navigation that happens after the initial capture', () => {
    setupBrowserSession({ lifecycle: 'route' });

    vi.runAllTimers();
    expect(SentryCore.captureSession).toHaveBeenCalledTimes(1);

    navigate('/initial', '/next');
    expect(SentryCore.startSession).toHaveBeenCalledTimes(2);
    expect(SentryCore.captureSession).toHaveBeenCalledTimes(2);
  });

  it('does not capture again when the user reference changes but id and ip stay the same', () => {
    setupBrowserSession({ lifecycle: 'page' });
    vi.runAllTimers();
    expect(SentryCore.captureSession).toHaveBeenCalledTimes(1);

    scopeHolder.current.setUser({ id: '1337', email: 'a@example.com' });
    expect(SentryCore.captureSession).toHaveBeenCalledTimes(2);

    // Same id and ip_address (only unrelated fields change) -> no extra capture.
    scopeHolder.current.setUser({ id: '1337', email: 'b@example.com' });
    expect(SentryCore.captureSession).toHaveBeenCalledTimes(2);
  });

  describe('`session` lifecycle', () => {
    const IDLE_TIMEOUT = 30 * 60_000;

    /** Moves the wall clock without running any pending timers. */
    function elapse(ms: number): void {
      vi.setSystemTime(Date.now() + ms);
    }

    function setupSessionLifecycle(options?: Omit<Parameters<typeof browserSessionIntegration>[0], 'lifecycle'>): void {
      setupBrowserSession({ ...options, lifecycle: 'session' });
    }

    /** Simulates the next page load in the same tab: the SDK re-initializes, sessionStorage does not. */
    function reload(options?: Omit<Parameters<typeof browserSessionIntegration>[0], 'lifecycle'>): void {
      vi.mocked(SentryCore.startSession).mockClear();
      vi.mocked(SentryCore.captureSession).mockClear();
      historyHandlers.current = [];
      domHandlers.current = [];
      setupSessionLifecycle(options);
    }

    it('persists the session so the next page load can resume it', () => {
      setupSessionLifecycle();

      expect(getStoredSession()).toEqual({
        sid: expect.any(String),
        started: Date.now(),
        lastActivity: Date.now(),
      });
    });

    it('resumes the persisted session on the next page load', () => {
      setupSessionLifecycle();
      const stored = getStoredSession();

      elapse(60_000);
      reload();

      expect(SentryCore.startSession).toHaveBeenCalledWith({
        sid: stored?.sid,
        started: (stored as PersistedSession).started / 1000,
        init: false,
        ignoreDuration: true,
      });
      expect(getStoredSession()?.sid).toBe(stored?.sid);
    });

    it('starts a new session when the persisted one idled out', () => {
      setupSessionLifecycle();
      const stored = getStoredSession();

      elapse(IDLE_TIMEOUT + 1);
      reload();

      expect(SentryCore.startSession).toHaveBeenCalledWith({ ignoreDuration: true });
      expect(getStoredSession()?.sid).not.toBe(stored?.sid);
    });

    it('starts a new session when the persisted one ran past its max duration', () => {
      // Shortened so the test does not have to simulate eight hours of activity.
      const shortLived = { idleTimeout: 10_000, maxDuration: 30_000 };
      setupSessionLifecycle(shortLived);
      const stored = getStoredSession();

      // Interacting throughout keeps it from idling out, so only the max duration can expire it.
      elapse(9_000);
      interact();
      elapse(9_000);
      interact();
      elapse(9_000);
      interact();
      elapse(9_000);

      reload(shortLived);

      expect(SentryCore.startSession).toHaveBeenCalledWith({ ignoreDuration: true });
      expect(getStoredSession()?.sid).not.toBe(stored?.sid);
    });

    it('keeps the session alive while the user is active', () => {
      setupSessionLifecycle();
      const stored = getStoredSession();

      elapse(IDLE_TIMEOUT - 1);
      interact();
      elapse(IDLE_TIMEOUT - 1);
      interact();

      expect(SentryCore.startSession).toHaveBeenCalledTimes(1);
      expect(getStoredSession()?.sid).toBe(stored?.sid);
    });

    it('rotates the session when the user returns after idling out', () => {
      setupSessionLifecycle();
      const stored = getStoredSession();
      vi.runAllTimers();
      expect(SentryCore.captureSession).toHaveBeenCalledTimes(1);

      elapse(IDLE_TIMEOUT + 1);
      interact();

      expect(SentryCore.startSession).toHaveBeenCalledTimes(2);
      expect(SentryCore.captureSession).toHaveBeenCalledTimes(2);
      expect(getStoredSession()?.sid).not.toBe(stored?.sid);
    });

    it('treats navigation as activity', () => {
      setupSessionLifecycle();
      const stored = getStoredSession();

      elapse(IDLE_TIMEOUT - 1);
      navigate('/initial', '/next');
      elapse(IDLE_TIMEOUT - 1);
      navigate('/next', '/last');

      expect(SentryCore.startSession).toHaveBeenCalledTimes(1);
      expect(getStoredSession()?.sid).toBe(stored?.sid);
    });

    it.each([{ lifecycle: 'page' } as const, { lifecycle: 'route' } as const, undefined])(
      'does not persist or resume anything with options %o',
      options => {
        setupBrowserSession(options);

        expect(SentryCore.startSession).toHaveBeenCalledWith({ ignoreDuration: true });
        expect(getStoredSession()).toBeUndefined();

        navigate('/initial', '/next');
        interact();

        expect(getStoredSession()).toBeUndefined();
      },
    );
  });
});
