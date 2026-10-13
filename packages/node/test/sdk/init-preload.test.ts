import { originalConsoleMethods } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { getClient } from '../../src/';
import { init } from '../../src/sdk';
import { cleanupOtel } from '../helpers/mockSdkInit';
import type * as WorkerThreads from 'node:worker_threads';

// eslint-disable-next-line no-var
declare var global: any;

const PUBLIC_DSN = 'https://username@domain/123';

const thread = { isMainThread: true, parentPort: {} as unknown };
let entryPointType = 'app';

vi.mock('node:worker_threads', async importOriginal => ({
  ...(await importOriginal<typeof WorkerThreads>()),
  get isMainThread() {
    return thread.isMainThread;
  },
  get parentPort() {
    return thread.parentPort;
  },
}));

vi.mock('../../src/utils/entry-point', () => ({
  getEntryPointType: () => entryPointType,
}));

/**
 * Once the console integration has run, `consoleSandbox` swaps `console.warn` for the native
 * method it stashed in `originalConsoleMethods`, bypassing a plain `console` spy. Cover both.
 */
function spyOnConsoleWarn(): Mock {
  const spy = vi.fn();

  vi.spyOn(console, 'warn').mockImplementation(spy);
  if (originalConsoleMethods.warn) {
    vi.spyOn(originalConsoleMethods, 'warn').mockImplementation(spy);
  }

  return spy;
}

describe('init() preload guards', () => {
  beforeEach(() => {
    global.__SENTRY__ = {};
    thread.isMainThread = true;
    thread.parentPort = {};
    entryPointType = 'app';
  });

  afterEach(() => {
    cleanupOtel();
    vi.clearAllMocks();
  });

  it('skips initialization on the module loader thread', () => {
    thread.isMainThread = false;
    thread.parentPort = undefined;

    expect(init({ dsn: PUBLIC_DSN })).toBeUndefined();
    expect(getClient()).toBeUndefined();
  });

  it('initializes on user-created worker threads', () => {
    thread.isMainThread = false;

    expect(init({ dsn: PUBLIC_DSN })).toBeDefined();
  });

  it('warns when initialized from a `--require` preload', () => {
    const warnSpy = spyOnConsoleWarn();
    entryPointType = 'require';

    init({ dsn: PUBLIC_DSN });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Use `--import` instead'));
  });

  it('does not warn when initialized from an `--import` preload', () => {
    const warnSpy = spyOnConsoleWarn();
    entryPointType = 'import';

    init({ dsn: PUBLIC_DSN });

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
