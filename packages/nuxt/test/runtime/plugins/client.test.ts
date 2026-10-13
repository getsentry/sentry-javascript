import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportNuxtError } from '../../../src/runtime/utils';

vi.mock('nuxt/app', () => ({
  defineNuxtPlugin: (plugin: unknown) => plugin,
  isNuxtError: (error: unknown) => !!error && typeof error === 'object' && '__nuxt_error' in error,
}));

vi.mock('../../../src/runtime/utils', () => ({
  reportNuxtError: vi.fn(),
}));

type Hook = (...args: unknown[]) => void;

async function setupHooks(): Promise<Record<string, Hook>> {
  const { default: plugin } = await import('../../../src/runtime/plugins/sentry.client');
  const hooks: Record<string, Hook> = {};
  const nuxtApp = { hook: (name: string, hook: Hook) => (hooks[name] = hook) };
  await (plugin as unknown as { setup: (app: unknown) => Promise<void> }).setup(nuxtApp);
  return hooks;
}

function nuxtError(statusCode: number): Error {
  return Object.assign(new Error(`status ${statusCode}`), { __nuxt_error: true, statusCode });
}

describe('sentry client plugin error hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['app:error', 'vue:error'])('does not report 3xx/4xx Nuxt errors from %s', async hookName => {
    const hooks = await setupHooks();

    hooks[hookName]?.(nuxtError(404));
    hooks[hookName]?.(nuxtError(301));

    expect(reportNuxtError).not.toHaveBeenCalled();
  });

  it.each(['app:error', 'vue:error'])('reports 5xx Nuxt errors from %s', async hookName => {
    const hooks = await setupHooks();

    hooks[hookName]?.(nuxtError(503));

    expect(reportNuxtError).toHaveBeenCalledTimes(1);
  });

  it('reports errors that are not Nuxt errors from vue:error', async () => {
    const hooks = await setupHooks();
    const error = Object.assign(new Error('boom'), { statusCode: 404 });

    hooks['vue:error']?.(error, undefined, 'setup function');

    expect(reportNuxtError).toHaveBeenCalledWith({ error, instance: undefined, info: 'setup function' });
  });
});
