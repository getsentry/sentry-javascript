import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockDebugBuild = true;

vi.mock('../src/debug-build', () => ({
  get DEBUG_BUILD() {
    return mockDebugBuild;
  },
}));

const { devWarnOnce, _resetDevWarningsForTests } = await import('../src/devWarnings');

describe('devWarnOnce()', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    consoleWarnSpy.mockClear();
    _resetDevWarningsForTests();
    mockDebugBuild = true;
  });

  afterEach(() => {
    mockDebugBuild = true;
  });

  it('prefixes and dedupes warnings in debug builds', () => {
    devWarnOnce('test', 'hello');
    devWarnOnce('test', 'hello');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith('[@sentry/wasm] hello');
  });

  it('is a no-op when DEBUG_BUILD is false', () => {
    mockDebugBuild = false;
    devWarnOnce('test', 'hello');
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
