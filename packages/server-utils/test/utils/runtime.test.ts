import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBun, isCloudflareWorkers, isDeno } from '../../src/utils/runtime';

describe('runtime detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects none of the runtimes in Node', () => {
    expect(isBun()).toBe(false);
    expect(isDeno()).toBe(false);
    expect(isCloudflareWorkers()).toBe(false);
  });

  it('detects Bun', () => {
    vi.stubGlobal('Bun', {});
    expect(isBun()).toBe(true);
  });

  it('detects Deno', () => {
    vi.stubGlobal('Deno', {});
    expect(isDeno()).toBe(true);
  });

  it('detects Cloudflare Workers by its exact user agent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });
    expect(isCloudflareWorkers()).toBe(true);

    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (compatible; Cloudflare-Traffic-Manager/1.0)' });
    expect(isCloudflareWorkers()).toBe(false);
  });
});
