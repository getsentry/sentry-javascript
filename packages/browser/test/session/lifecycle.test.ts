/**
 * @vitest-environment jsdom
 */

import type * as SentryCore from '@sentry/core/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SessionLifecycle from '../../src/session/lifecycle';

const coreEndSession = vi.hoisted(() => vi.fn());

vi.mock('@sentry/core/browser', async importActual => ({
  ...((await importActual()) as typeof SentryCore),
  endSession: coreEndSession,
}));

describe('endSession', () => {
  let lifecycle: typeof SessionLifecycle;

  beforeEach(async () => {
    vi.clearAllMocks();
    // The registered rotator is module state, so every test needs its own copy of the module.
    vi.resetModules();
    lifecycle = await import('../../src/session/lifecycle');
  });

  it('hands off to the rotator registered by the session lifecycle', () => {
    const rotate = vi.fn();
    lifecycle.setSessionRotator(rotate);

    lifecycle.endSession();

    expect(rotate).toHaveBeenCalledTimes(1);
    expect(coreEndSession).not.toHaveBeenCalled();
  });

  it('closes the session on the scope when no lifecycle is managing sessions', () => {
    lifecycle.endSession();

    expect(coreEndSession).toHaveBeenCalledTimes(1);
  });
});
