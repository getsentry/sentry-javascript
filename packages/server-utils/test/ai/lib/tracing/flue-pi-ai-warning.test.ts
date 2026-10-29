import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

const MODEL_OP = { type: 'model', turnId: 'turn_1' };

/** A fresh module per test: the check runs once per process. */
async function runModelCalls(count: number): Promise<void> {
  vi.resetModules();
  const { createFlueInstrumentation } = await import('../../../../src/ai/flue');
  const instrumentation = createFlueInstrumentation();
  for (let i = 0; i < count; i++) {
    await instrumentation.interceptor(MODEL_OP, {}, async () => undefined);
  }
}

describe('Flue warning about uninstrumented pi-ai', () => {
  afterEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
    vi.restoreAllMocks();
  });

  it('warns once when pi-ai was not instrumented', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@flue/runtime'] };

    await runModelCalls(2);

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('`@earendil-works/pi-ai` was not instrumented'));
  });

  it.each([
    ['the runtime hook', { runtime: ['@earendil-works/pi-ai'] }],
    ['a bundler plugin', { bundler: new Set(['@earendil-works/pi-ai']) }],
  ])('stays quiet when %s instrumented pi-ai', async (_label, injected) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = injected;

    await runModelCalls(1);

    expect(warn).not.toHaveBeenCalled();
  });
});
