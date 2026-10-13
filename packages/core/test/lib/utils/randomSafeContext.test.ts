import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RUNNER_KEY = Symbol.for('__SENTRY_SAFE_RANDOM_ID_WRAPPER__');

type Runner = <T>(callback: () => T) => T;

function registerRunner(runner: Runner): void {
  (globalThis as Record<symbol, unknown>)[RUNNER_KEY] = runner;
}

describe('withRandomSafeContext', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, RUNNER_KEY);
  });

  it('calls the callback directly when no runner is registered', async () => {
    const { withRandomSafeContext } = await import('../../../src/utils/randomSafeContext');

    expect(withRandomSafeContext(() => 'value')).toBe('value');
  });

  it('uses a runner that is registered after the first call', async () => {
    const { withRandomSafeContext } = await import('../../../src/utils/randomSafeContext');
    expect(withRandomSafeContext(() => 'first')).toBe('first');

    const runner = vi.fn(<T>(callback: () => T): T => callback());
    registerRunner(runner);

    expect(withRandomSafeContext(() => 'second')).toBe('second');
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('keeps using the runner it resolved', async () => {
    const { withRandomSafeContext } = await import('../../../src/utils/randomSafeContext');
    const runner = vi.fn(<T>(callback: () => T): T => callback());
    registerRunner(runner);

    withRandomSafeContext(() => 'first');
    Reflect.deleteProperty(globalThis, RUNNER_KEY);
    withRandomSafeContext(() => 'second');

    expect(runner).toHaveBeenCalledTimes(2);
  });
});
