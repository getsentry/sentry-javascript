import { tracingChannel } from 'node:diagnostics_channel';
import type { Client } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setHttpServerSpanRouteAttribute = vi.hoisted(() => vi.fn());
vi.mock('../../../src/utils/setHttpServerSpanRouteAttribute', () => ({ setHttpServerSpanRouteAttribute }));

import {
  createMastraRouteNamingMiddleware,
  injectMastraRouteNamingMiddleware,
} from '../../../src/integrations/mastra-route-naming';
import { mastraIntegration } from '../../../src/integrations/mastra';
import { CHANNELS } from '../../../src/orchestrion/channels';

// A route handler is `(c)` (arity 1); a middleware is `(c, next)` (arity 2).
const handler = (_c: unknown): void => undefined;
const middleware = (_c: unknown, _next: unknown): void => undefined;

function fakeContext(opts: {
  method?: string;
  routeIndex: number;
  routePath?: string;
  matchedRoutes: Array<{ handler: unknown; path: string }>;
}): any {
  return {
    req: {
      method: opts.method ?? 'GET',
      routeIndex: opts.routeIndex,
      routePath: opts.routePath ?? '',
      matchedRoutes: opts.matchedRoutes,
    },
  };
}

const next = (): Promise<void> => Promise.resolve();

describe('injectMastraRouteNamingMiddleware', () => {
  it('creates server.middleware as an array when absent', () => {
    const config: any = {};
    injectMastraRouteNamingMiddleware(config);
    expect(Array.isArray(config.server.middleware)).toBe(true);
    expect(config.server.middleware).toHaveLength(1);
    expect(config.server.middleware[0].path).toBe('*');
    expect(typeof config.server.middleware[0].handler).toBe('function');
  });

  it('prepends to an existing middleware array', () => {
    const existing = { handler: middleware, path: '/api/*' };
    const config: any = { server: { middleware: [existing] } };
    injectMastraRouteNamingMiddleware(config);
    expect(config.server.middleware).toHaveLength(2);
    expect(config.server.middleware[0].path).toBe('*'); // ours runs first
    expect(config.server.middleware[1]).toBe(existing);
  });

  it('normalizes a single (non-array) middleware into an array', () => {
    const single = () => undefined;
    const config: any = { server: { middleware: single } };
    injectMastraRouteNamingMiddleware(config);
    expect(Array.isArray(config.server.middleware)).toBe(true);
    expect(config.server.middleware[1]).toBe(single);
  });

  it('is a no-op for a non-object config', () => {
    expect(() => injectMastraRouteNamingMiddleware(undefined)).not.toThrow();
    expect(() => injectMastraRouteNamingMiddleware(null)).not.toThrow();
  });
});

describe('createMastraRouteNamingMiddleware', () => {
  beforeEach(() => setHttpServerSpanRouteAttribute.mockClear());

  it('uses the matched handler at routeIndex', async () => {
    const mw = createMastraRouteNamingMiddleware();
    await mw(
      fakeContext({
        routeIndex: 1,
        matchedRoutes: [
          { handler: middleware, path: '/*' },
          { handler, path: '/echo/:id' },
        ],
      }),
      next,
    );
    expect(setHttpServerSpanRouteAttribute).toHaveBeenCalledWith('/echo/:id');
  });

  it('falls back to the last handler when routeIndex points at a middleware', async () => {
    const mw = createMastraRouteNamingMiddleware();
    await mw(
      fakeContext({
        routeIndex: 2, // a trailing catch-all middleware
        matchedRoutes: [
          { handler: middleware, path: '/*' },
          { handler, path: '/echo/:id' },
          { handler: middleware, path: '/*' },
        ],
      }),
      next,
    );
    expect(setHttpServerSpanRouteAttribute).toHaveBeenCalledWith('/echo/:id');
  });

  it('does not set a route when only middleware matched (no handler)', async () => {
    const mw = createMastraRouteNamingMiddleware();
    await mw(
      fakeContext({
        routeIndex: 0,
        routePath: '',
        matchedRoutes: [{ handler: middleware, path: '/*' }],
      }),
      next,
    );
    expect(setHttpServerSpanRouteAttribute).not.toHaveBeenCalled();
  });
});

describe('mastraIntegration route-naming injection', () => {
  beforeEach(() => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@mastra/core'] };
  });
  afterEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  // `instrumentMastra` subscribes at most once per process, so the opt-out case (which must not
  // subscribe at all) lives in its own file to get clean module state — see route-naming-optout.test.ts.
  it('injects the middleware into the constructor config by default', () => {
    mastraIntegration().setup?.({ on: () => () => undefined } as unknown as Client);
    const config: any = { server: {} };
    tracingChannel(CHANNELS.MASTRA_CONSTRUCTOR).start.publish({ arguments: [config] });
    expect(Array.isArray(config.server.middleware)).toBe(true);
    expect(config.server.middleware[0].path).toBe('*');
  });
});
