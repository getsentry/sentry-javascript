import { GLOBAL_OBJ } from '@sentry/core';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MODEL_OP = { type: 'model' };
const NOT_TRACED =
  '[Sentry] Flue model calls are not being traced: `@earendil-works/pi-ai` was not instrumented, so ' +
  'Flue agents record agent and tool spans but no `gen_ai.chat` spans. ';

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
  let warn: MockInstance;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('warns once when pi-ai was not instrumented', async () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@flue/runtime'] };

    await runModelCalls(2);

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(NOT_TRACED));
  });

  it.each([
    ['Node', {}, 'Load Sentry with `--import`, for example `node --import ./instrument.mjs app.mjs`.'],
    [
      'Bun',
      { Bun: {} },
      'Build your app with `sentryBunPlugin()` from `@sentry/bun/plugin`; `bun run` cannot instrument it.',
    ],
    ['Deno', { Deno: {} }, 'Run your app with `deno run --preload=npm:@sentry/deno/import app.ts`.'],
    [
      'Cloudflare',
      { navigator: { userAgent: 'Cloudflare-Workers' } },
      'Add `sentryCloudflareVitePlugin()` from `@sentry/cloudflare/vite` to your Vite config.',
    ],
  ])('gives only the fix for %s', async (_runtime, globals, fix) => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@flue/runtime'] };
    Object.entries(globals).forEach(([name, value]) => vi.stubGlobal(name, value));

    await runModelCalls(1);

    expect(warn).toHaveBeenCalledWith(NOT_TRACED + fix);
  });

  it.each([
    ['the runtime hook', { runtime: ['@earendil-works/pi-ai'] }],
    ['a bundler plugin', { bundler: new Set(['@earendil-works/pi-ai']) }],
  ])('stays quiet when %s instrumented pi-ai', async (_label, injected) => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = injected;

    await runModelCalls(1);

    expect(warn).not.toHaveBeenCalled();
  });
});
