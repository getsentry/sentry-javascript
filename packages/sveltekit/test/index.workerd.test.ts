import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCloudflareExecutionContext, setCloudflareExecutionContextFallback } from '../src/server-common/utils';

describe('workerd entry point', () => {
  afterEach(() => {
    setCloudflareExecutionContextFallback(undefined);
    vi.resetModules();
    vi.doUnmock('cloudflare:workers');
  });

  it('registers `waitUntil` from `cloudflare:workers` as the fallback execution context', async () => {
    const waitUntil = vi.fn();
    vi.doMock('cloudflare:workers', () => ({ waitUntil }));

    const workerdSdk = await import('../src/index.workerd');

    const context = getCloudflareExecutionContext(undefined);
    const task = Promise.resolve();
    context?.waitUntil(task);

    expect(waitUntil).toHaveBeenCalledWith(task);
    expect(workerdSdk.initCloudflareSentryHandle).toBeTypeOf('function');
  });

  it('still prefers the execution context on `platform`', async () => {
    vi.doMock('cloudflare:workers', () => ({ waitUntil: vi.fn() }));
    await import('../src/index.workerd');

    const ctx = { waitUntil: vi.fn() };

    expect(getCloudflareExecutionContext({ ctx })).toBe(ctx);
  });

  it('resolves no execution context on runtimes where `waitUntil` is not importable', async () => {
    vi.doMock('cloudflare:workers', () => ({}));
    await import('../src/index.workerd');

    expect(getCloudflareExecutionContext(undefined)).toBeUndefined();
  });
});
