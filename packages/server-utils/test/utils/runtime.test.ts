import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBun, isBunRuntimeInstrumentationSupported, isCloudflareWorkers, isDeno } from '../../src/utils/runtime';

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

  it.each([
    ['1.4.4', false],
    ['1.4.5', true],
    ['1.5.0', true],
    ['2.0.0', true],
    ['1.3.14', false],
  ])('detects whether Bun %s can instrument modules in `bun run`', (version, supported) => {
    vi.stubGlobal('Bun', { version });
    expect(isBunRuntimeInstrumentationSupported()).toBe(supported);
  });

  it('does not support `bun run` instrumentation outside of Bun', () => {
    expect(isBunRuntimeInstrumentationSupported()).toBe(false);
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
