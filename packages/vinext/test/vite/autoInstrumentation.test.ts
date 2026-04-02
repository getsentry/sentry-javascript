import { describe, expect, it } from 'vitest';
import { makeAutoInstrumentationPlugin } from '../../src/vite/autoInstrumentation';

describe('makeAutoInstrumentationPlugin', () => {
  it('creates a plugin with the correct name', () => {
    const plugin = makeAutoInstrumentationPlugin(true);
    expect(plugin.name).toBe('sentry-vinext-auto-instrumentation');
  });

  it('sets enforce to pre', () => {
    const plugin = makeAutoInstrumentationPlugin(true);
    expect(plugin.enforce).toBe('pre');
  });

  it('returns null for non-matching files', () => {
    const plugin = makeAutoInstrumentationPlugin(true);
    const load = plugin.load as (id: string) => string | null;
    expect(load('/Users/project/src/utils/helper.ts')).toBeNull();
  });

  it('returns null for already-wrapped modules', () => {
    const plugin = makeAutoInstrumentationPlugin(true);
    const load = plugin.load as (id: string) => string | null;
    expect(load('/Users/project/app/page.tsx?sentry-auto-wrap')).toBeNull();
  });

  it('wraps App Router route handlers', () => {
    const plugin = makeAutoInstrumentationPlugin(true);
    const load = plugin.load as (id: string) => string | null;
    const result = load('/Users/project/app/api/users/route.ts');

    expect(result).not.toBeNull();
    expect(result).toContain('wrapRouteHandlerWithSentry');
    expect(result).toContain('sentry-auto-wrap');
    expect(result).toContain('/api/users');
  });

  it('wraps App Router page components', () => {
    const plugin = makeAutoInstrumentationPlugin(true);
    const load = plugin.load as (id: string) => string | null;
    const result = load('/Users/project/app/blog/[slug]/page.tsx');

    expect(result).not.toBeNull();
    expect(result).toContain('wrapServerComponentWithSentry');
    expect(result).toContain('/blog/[slug]');
    expect(result).toContain('"page"');
  });

  it('wraps App Router layout components', () => {
    const plugin = makeAutoInstrumentationPlugin(true);
    const load = plugin.load as (id: string) => string | null;
    const result = load('/Users/project/app/layout.tsx');

    expect(result).not.toBeNull();
    expect(result).toContain('wrapServerComponentWithSentry');
    expect(result).toContain('"layout"');
  });

  it('wraps middleware files', () => {
    const plugin = makeAutoInstrumentationPlugin(true);
    const load = plugin.load as (id: string) => string | null;
    const result = load('/Users/project/middleware.ts');

    expect(result).not.toBeNull();
    expect(result).toContain('wrapMiddlewareWithSentry');
  });

  it('wraps Pages Router API routes', () => {
    const plugin = makeAutoInstrumentationPlugin(true);
    const load = plugin.load as (id: string) => string | null;
    const result = load('/Users/project/pages/api/users/[id].ts');

    expect(result).not.toBeNull();
    expect(result).toContain('wrapApiHandlerWithSentry');
    expect(result).toContain('/api/users/[id]');
  });

  it('does not wrap middleware inside app/ directory', () => {
    const plugin = makeAutoInstrumentationPlugin(true);
    const load = plugin.load as (id: string) => string | null;
    expect(load('/Users/project/app/middleware.ts')).toBeNull();
  });

  it('respects disabled options', () => {
    const plugin = makeAutoInstrumentationPlugin({
      serverComponents: false,
      routeHandlers: false,
      middleware: false,
      apiRoutes: false,
    });
    const load = plugin.load as (id: string) => string | null;

    expect(load('/Users/project/app/page.tsx')).toBeNull();
    expect(load('/Users/project/app/api/route.ts')).toBeNull();
    expect(load('/Users/project/middleware.ts')).toBeNull();
    expect(load('/Users/project/pages/api/test.ts')).toBeNull();
  });

  it('allows selective enabling', () => {
    const plugin = makeAutoInstrumentationPlugin({
      serverComponents: false,
      routeHandlers: true,
      middleware: false,
      apiRoutes: false,
    });
    const load = plugin.load as (id: string) => string | null;

    expect(load('/Users/project/app/page.tsx')).toBeNull();
    expect(load('/Users/project/app/api/route.ts')).not.toBeNull();
    expect(load('/Users/project/middleware.ts')).toBeNull();
  });
});
