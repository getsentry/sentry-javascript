/**
 * @vitest-environment jsdom
 */

import type { Scope, User } from '@sentry/core/browser';
import * as SentryCore from '@sentry/core/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserSessionIntegration } from '../../src/integrations/browsersession';

const scopeHolder = vi.hoisted(() => ({ current: undefined as unknown as FakeIsolationScope }));

const historyHandlers = vi.hoisted(() => ({ current: [] as Array<(data: { from?: string; to?: string }) => void> }));

vi.mock('@sentry/core/browser', async importActual => {
  const actual = (await importActual()) as typeof SentryCore;
  return {
    ...actual,
    startSession: vi.fn(),
    captureSession: vi.fn(),
    getIsolationScope: () => scopeHolder.current,
  };
});

// Capture the registered history handler so navigation can be driven deterministically,
// while keeping the real `whenIdleOrHidden` (the tests drive its timers/events directly).
vi.mock('@sentry/browser-utils', async importActual => {
  const actual = (await importActual()) as typeof import('@sentry/browser-utils');
  return {
    ...actual,
    addHistoryInstrumentationHandler: (handler: (data: { from?: string; to?: string }) => void) => {
      historyHandlers.current.push(handler);
    },
  };
});

function navigate(from: string, to: string): void {
  historyHandlers.current.forEach(handler => handler({ from, to }));
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

    window.dispatchEvent(new Event('pagehide'));
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
    // Default lifecycle is 'route', which also registers the navigation handler.
    setupBrowserSession();

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
    setupBrowserSession();

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
});
