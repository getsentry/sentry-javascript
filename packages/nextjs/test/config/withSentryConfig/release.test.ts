import { describe, expect, it } from 'vitest';
import { maybeAddReleaseServerTimingHeader } from '../../../src/config/withSentryConfig/release';
import type { NextConfigObject } from '../../../src/config/types';

const RELEASE_HEADER = {
  source: '/:path((?!_next/).*)',
  locale: false,
  headers: [{ key: 'Server-Timing', value: 'sentry-release;desc="my-app%401.0.0%3Abuild"' }],
};

describe('maybeAddReleaseServerTimingHeader', () => {
  it('sends the encoded release in a `Server-Timing` header with `release.inject: false`', async () => {
    const nextConfig: NextConfigObject = {};

    maybeAddReleaseServerTimingHeader(nextConfig, { release: { inject: false } }, 'my-app@1.0.0:build');

    await expect(nextConfig.headers?.()).resolves.toEqual([RELEASE_HEADER]);
  });

  it("keeps the app's headers after the release header", async () => {
    const appHeader = { source: '/', headers: [{ key: 'Server-Timing', value: 'app;dur=1' }] };
    const nextConfig: NextConfigObject = { headers: async () => [appHeader] };

    maybeAddReleaseServerTimingHeader(nextConfig, { release: { inject: false } }, 'my-app@1.0.0:build');

    await expect(nextConfig.headers?.()).resolves.toEqual([RELEASE_HEADER, appHeader]);
  });

  it.each([
    ['the release is injected into the client bundles', {}, {}, 'my-app'],
    ['the app is a static export', { output: 'export' }, { release: { inject: false } }, 'my-app'],
    ['there is no release', {}, { release: { inject: false } }, undefined],
  ])('adds no header when %s', (_, nextConfig: NextConfigObject, sentryOptions, releaseName) => {
    maybeAddReleaseServerTimingHeader(nextConfig, sentryOptions, releaseName);

    expect(nextConfig.headers).toBeUndefined();
  });
});
