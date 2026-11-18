// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import releaseMiddleware from '../../src/nitro/releaseMiddleware';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('releaseMiddleware', () => {
  it('adds the release that the build defines to HTML responses', async () => {
    vi.stubGlobal('__SENTRY_SOLIDSTART_RELEASE__', '1.0.0');

    const response = await releaseMiddleware(
      {},
      () => new Response('<head></head>', { headers: { 'content-type': 'text/html' } }),
    );

    await expect((response as Response).text()).resolves.toBe(
      '<head><meta name="sentry-release" content="1.0.0"/></head>',
    );
  });

  it('passes the response on when the build defines no release', async () => {
    const original = new Response('<head></head>', { headers: { 'content-type': 'text/html' } });

    await expect(releaseMiddleware({}, () => original)).resolves.toBe(original);
  });
});
