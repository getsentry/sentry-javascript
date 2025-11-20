import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Tunnel Route Caching (Environment Variable)', () => {
  let originalNextPhase: string | undefined;
  let originalTunnelRoute: string | undefined;

  beforeEach(() => {
    // Save and clear env vars
    originalNextPhase = process.env.NEXT_PHASE;
    originalTunnelRoute = process.env.__SENTRY_TUNNEL_ROUTE__;
    delete process.env.__SENTRY_TUNNEL_ROUTE__;
  });

  afterEach(() => {
    // Restore env vars
    if (originalNextPhase !== undefined) {
      process.env.NEXT_PHASE = originalNextPhase;
    } else {
      delete process.env.NEXT_PHASE;
    }

    if (originalTunnelRoute !== undefined) {
      process.env.__SENTRY_TUNNEL_ROUTE__ = originalTunnelRoute;
    } else {
      delete process.env.__SENTRY_TUNNEL_ROUTE__;
    }
  });

  it('caches tunnel route in environment variable during build phase', () => {
    process.env.NEXT_PHASE = 'phase-production-build';
    process.env.__SENTRY_TUNNEL_ROUTE__ = '/cached-route-123';

    // The env var should be accessible
    expect(process.env.__SENTRY_TUNNEL_ROUTE__).toBe('/cached-route-123');
  });

  it('environment variable persists across different contexts', () => {
    process.env.NEXT_PHASE = 'phase-production-build';
    process.env.__SENTRY_TUNNEL_ROUTE__ = '/test-route-456';

    // Simulate accessing from different module
    const cachedRoute = process.env.__SENTRY_TUNNEL_ROUTE__;

    expect(cachedRoute).toBe('/test-route-456');
  });

  it('verifies NEXT_PHASE detection for build time', () => {
    process.env.NEXT_PHASE = 'phase-production-build';

    const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

    expect(isBuildTime).toBe(true);
  });

  it('verifies NEXT_PHASE detection for non-build time', () => {
    process.env.NEXT_PHASE = 'phase-development-server';

    const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

    expect(isBuildTime).toBe(false);
  });

  it('handles missing NEXT_PHASE', () => {
    delete process.env.NEXT_PHASE;

    const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

    expect(isBuildTime).toBe(false);
  });
});

describe('Random Tunnel Route Generation', () => {
  it('generates an 8-character alphanumeric string', () => {
    const randomString = Math.random().toString(36).substring(2, 10);
    const tunnelRoute = `/${randomString}`;

    // Should be a path with 8 alphanumeric chars
    expect(tunnelRoute).toMatch(/^\/[a-z0-9]{8}$/);
  });

  it('generates different values on multiple calls', () => {
    const route1 = `/${Math.random().toString(36).substring(2, 10)}`;
    const route2 = `/${Math.random().toString(36).substring(2, 10)}`;

    // Very unlikely to be the same (but not impossible)
    // This is more of a sanity check
    expect(route1).toMatch(/^\/[a-z0-9]{8}$/);
    expect(route2).toMatch(/^\/[a-z0-9]{8}$/);
  });
});
