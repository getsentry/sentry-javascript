import { describe, expect, it, vi } from 'vitest';
import type { CloudflareOptions } from '../src/client';
import { _INTERNAL_withSameWorkerRpcBindings } from '../src/rpcBindings';

const env = { SENTRY_DSN: 'https://public@dsn.ingest.sentry.io/1337' };

function withBindings(
  options: CloudflareOptions | undefined,
  bindingNames: string[] = ['MY_DO', 'SELF'],
): CloudflareOptions | undefined {
  return _INTERNAL_withSameWorkerRpcBindings(() => options, bindingNames)(env);
}

describe('_INTERNAL_withSameWorkerRpcBindings', () => {
  it('enables the injected bindings when the user configures nothing', () => {
    expect(withBindings({ dsn: 'https://public@dsn.ingest.sentry.io/1337' })).toEqual({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      enableRpcTracePropagation: ['MY_DO', 'SELF'],
    });
  });

  it('enables the injected bindings when the options callback returns undefined', () => {
    expect(withBindings(undefined)).toEqual({ enableRpcTracePropagation: ['MY_DO', 'SELF'] });
  });

  it('adds user-configured bindings on top of the injected ones', () => {
    expect(withBindings({ enableRpcTracePropagation: ['EXTERNAL', /^SVC_/] })).toEqual({
      enableRpcTracePropagation: ['MY_DO', 'SELF', 'EXTERNAL', /^SVC_/],
    });
  });

  it('leaves an explicit `false` untouched, discarding the injected bindings', () => {
    expect(withBindings({ enableRpcTracePropagation: false })).toEqual({ enableRpcTracePropagation: false });
  });

  it('leaves an explicit `true` untouched', () => {
    expect(withBindings({ enableRpcTracePropagation: true })).toEqual({ enableRpcTracePropagation: true });
  });

  it('returns the original callback when there are no bindings to inject', () => {
    const optionsCallback = vi.fn(() => ({ dsn: 'https://public@dsn.ingest.sentry.io/1337' }));

    expect(_INTERNAL_withSameWorkerRpcBindings(optionsCallback, [])).toBe(optionsCallback);
  });

  it('resolves the options callback per invocation', () => {
    const optionsCallback = vi.fn((e: typeof env) => ({ dsn: e.SENTRY_DSN }));
    const merged = _INTERNAL_withSameWorkerRpcBindings(optionsCallback, ['MY_DO']);

    merged(env);
    merged(env);

    expect(optionsCallback).toHaveBeenCalledTimes(2);
    expect(optionsCallback).toHaveBeenCalledWith(env);
  });
});
