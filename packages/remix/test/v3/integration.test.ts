import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkRemixV3Instrumentation = vi.fn();

vi.mock('../../src/v3/server/checkInstrumentation', () => ({
  checkRemixV3Instrumentation: (...args: unknown[]) => checkRemixV3Instrumentation(...args),
  warnRemixV3: vi.fn(),
}));

const { remixV3Integration } = await import('../../src/v3/server/integration');

describe('remixV3Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    checkRemixV3Instrumentation.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks the instrumentation after the current import graph has loaded, not during setup', () => {
    remixV3Integration().setupOnce?.();

    expect(checkRemixV3Instrumentation).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(checkRemixV3Instrumentation).toHaveBeenCalledTimes(1);
  });
});
