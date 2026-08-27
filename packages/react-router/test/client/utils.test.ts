import * as core from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeNavigationSpanFromRouterState,
  resolveNavigateAbsoluteUrl,
  updateNavigationSpanUrlFromLocation,
  updateSpanWithParameterizedRoute,
} from '../../src/client/utils';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    getClient: vi.fn(),
  };
});

vi.mock('@sentry/browser', () => ({
  getAbsoluteUrl: vi.fn((urlOrPath: string) => {
    try {
      return new URL(urlOrPath, 'https://example.com').toString();
    } catch {
      return urlOrPath;
    }
  }),
}));

// Span streaming is the default trace lifecycle, and it's what makes span names low cardinality.
const streamingClient = { getOptions: () => ({ traceLifecycle: 'stream' }) } as unknown as core.Client;

function mockSpan(): { updateName: ReturnType<typeof vi.fn>; setAttributes: ReturnType<typeof vi.fn> } {
  return { updateName: vi.fn(), setAttributes: vi.fn() };
}

beforeEach(() => {
  vi.mocked(core.getClient).mockReset();
});

describe('resolveNavigateAbsoluteUrl', () => {
  const originalLocation = globalThis.location;

  beforeEach(() => {
    (globalThis as any).location = {
      href: 'https://example.com/users/123?tab=profile',
      origin: 'https://example.com',
      pathname: '/users/123',
      search: '?tab=profile',
      hash: '',
    };
  });

  afterEach(() => {
    if (originalLocation) {
      (globalThis as any).location = originalLocation;
    } else {
      delete (globalThis as any).location;
    }
  });

  it('resolves relative string targets against the current URL', () => {
    expect(resolveNavigateAbsoluteUrl('settings')).toBe('https://example.com/users/123/settings');
  });

  it('resolves absolute string targets from the origin', () => {
    expect(resolveNavigateAbsoluteUrl('/about')).toBe('https://example.com/about');
  });

  it('resolves parent-relative string targets against the current URL', () => {
    (globalThis as any).location = {
      href: 'https://example.com/users/123/profile',
      origin: 'https://example.com',
      pathname: '/users/123/profile',
      search: '',
      hash: '',
    };

    expect(resolveNavigateAbsoluteUrl('../settings')).toBe('https://example.com/users/123/settings');
  });

  it('resolves relative pathname in a To object against the current URL', () => {
    expect(resolveNavigateAbsoluteUrl({ pathname: 'settings' })).toBe('https://example.com/users/123/settings');
  });

  it('preserves search and hash from a To object', () => {
    expect(resolveNavigateAbsoluteUrl({ pathname: 'settings', search: '?foo=bar', hash: '#section' })).toBe(
      'https://example.com/users/123/settings?foo=bar#section',
    );
  });

  it('resolves search-only To objects against the current URL', () => {
    expect(resolveNavigateAbsoluteUrl({ search: '?foo=bar' })).toBe('https://example.com/users/123?foo=bar');
  });

  it('uses currentUrl as fallback when location.href is unavailable', () => {
    (globalThis as any).location = { origin: 'https://example.com' };

    expect(resolveNavigateAbsoluteUrl('settings', '/users/123')).toBe('https://example.com/users/123/settings');
  });

  it('resolves a relative target on a path without a trailing slash as a child segment', () => {
    (globalThis as any).location = {
      href: 'https://example.com/performance',
      origin: 'https://example.com',
      pathname: '/performance',
      search: '',
      hash: '',
    };

    expect(resolveNavigateAbsoluteUrl('ssr')).toBe('https://example.com/performance/ssr');
  });
});

describe('updateNavigationSpanUrlFromLocation', () => {
  const originalLocation = globalThis.location;

  beforeEach(() => {
    (globalThis as any).location = {
      href: 'https://example.com/foo?bar=1#section',
      origin: 'https://example.com',
      pathname: '/foo',
      search: '?bar=1',
      hash: '#section',
    };
  });

  afterEach(() => {
    if (originalLocation) {
      (globalThis as any).location = originalLocation;
    } else {
      delete (globalThis as any).location;
    }
  });

  it('updates span name and url attributes from location', () => {
    const span = { updateName: vi.fn(), setAttributes: vi.fn() } as any;

    updateNavigationSpanUrlFromLocation(span);

    expect(span.updateName).toHaveBeenCalledWith('/foo');
    expect(span.setAttributes).toHaveBeenCalledWith({
      'sentry.segment.name.source': 'url',
      'url.path': '/foo',
      'url.full': 'https://example.com/foo?bar=1#section',
    });
  });

  it('falls back to a low cardinality name when span streaming is enabled', () => {
    vi.mocked(core.getClient).mockReturnValue(streamingClient);
    const span = mockSpan() as any;

    updateNavigationSpanUrlFromLocation(span);

    // The URL stays on the attributes, only the name is low cardinality.
    expect(span.updateName).toHaveBeenCalledWith('Navigation');
    expect(span.setAttributes).toHaveBeenCalledWith({
      'sentry.segment.name.source': 'url',
      'url.path': '/foo',
      'url.full': 'https://example.com/foo?bar=1#section',
    });
  });
});

describe('updateSpanWithParameterizedRoute', () => {
  it.each([
    // Framework mode: `prefix()` flattens the path onto each child, so the leaf holds the full path.
    ['a flat framework route', [{ path: '/' }, { path: 'performance/with/:param' }], '/performance/with/:param'],
    ['a flat framework index route', [{ path: '/' }, { path: 'performance', index: true }], '/performance'],
    // Library mode: nested route objects carry paths relative to their parent.
    ['a nested index route', [{ path: '/' }, { path: 'users/:id' }, { index: true }], '/users/:id'],
    ['a nested child route', [{ path: '/' }, { path: 'users/:id' }, { path: 'edit' }], '/users/:id/edit'],
    ['a root index route', [{ path: '/' }, { index: true }], '/'],
    ['a splat route', [{ path: '/' }, { path: '*' }], '/*'],
  ])('names the span after the route template for %s', (_label, routes, expected) => {
    const span = mockSpan() as any;

    updateSpanWithParameterizedRoute(span, {
      location: { pathname: '/users/123/edit' },
      matches: routes.map(route => ({ route })),
    } as any);

    expect(span.updateName).toHaveBeenCalledWith(expected);
    expect(span.setAttributes).toHaveBeenCalledWith({
      'sentry.segment.name.source': 'route',
      'url.template': expected,
    });
  });

  it('keeps the low cardinality name when a streamed navigation matches no route', () => {
    vi.mocked(core.getClient).mockReturnValue(streamingClient);
    const span = mockSpan() as any;

    updateSpanWithParameterizedRoute(span, {
      location: { pathname: '/users/123' },
      matches: [],
    } as any);

    expect(span.updateName).not.toHaveBeenCalled();
    expect(span.setAttributes).not.toHaveBeenCalled();
  });

  it('falls back to the raw pathname without span streaming', () => {
    const span = mockSpan() as any;

    updateSpanWithParameterizedRoute(span, {
      location: { pathname: '/users/123/' },
      matches: [],
    } as any);

    expect(span.updateName).toHaveBeenCalledWith('/users/123');
    expect(span.setAttributes).toHaveBeenCalledWith({
      'sentry.segment.name.source': 'route',
      'url.template': '/users/123',
    });
  });
});

describe('finalizeNavigationSpanFromRouterState', () => {
  const originalLocation = globalThis.location;

  beforeEach(() => {
    (globalThis as any).location = {
      href: 'https://example.com/performance/',
      origin: 'https://example.com',
      pathname: '/performance/',
      search: '',
      hash: '',
    };
  });

  afterEach(() => {
    if (originalLocation) {
      (globalThis as any).location = originalLocation;
    } else {
      delete (globalThis as any).location;
    }
  });

  it('parameterizes index-route navigations after numeric back', () => {
    const span = { updateName: vi.fn(), setAttributes: vi.fn() } as any;

    finalizeNavigationSpanFromRouterState(span, {
      location: { pathname: '/performance/' },
      matches: [{ route: { path: 'performance' } }, { route: { index: true } }],
      navigation: { state: 'idle' },
    } as any);

    expect(span.updateName).toHaveBeenLastCalledWith('/performance');
    expect(span.setAttributes).toHaveBeenLastCalledWith({
      'sentry.segment.name.source': 'route',
      'url.template': '/performance',
    });
  });

  it('sets url attributes but skips parameterization when router state is stale', () => {
    const span = { updateName: vi.fn(), setAttributes: vi.fn() } as any;

    finalizeNavigationSpanFromRouterState(span, {
      location: { pathname: '/performance/ssr' },
      matches: [{ route: { path: '/performance/ssr' } }],
      navigation: { state: 'idle' },
    } as any);

    expect(span.updateName).toHaveBeenCalledWith('/performance/');
    expect(span.updateName).toHaveBeenCalledTimes(1);
    expect(span.setAttributes).toHaveBeenCalledWith({
      'sentry.segment.name.source': 'url',
      'url.path': '/performance/',
      'url.full': 'https://example.com/performance/',
    });
    expect(span.setAttributes).toHaveBeenCalledTimes(1);
  });

  it('keeps the low cardinality name when a streamed navigation matches no route', () => {
    vi.mocked(core.getClient).mockReturnValue(streamingClient);
    const span = mockSpan() as any;

    finalizeNavigationSpanFromRouterState(span, {
      location: { pathname: '/performance/' },
      matches: [],
      navigation: { state: 'idle' },
    } as any);

    expect(span.updateName).toHaveBeenCalledWith('Navigation');
    expect(span.updateName).toHaveBeenCalledTimes(1);
    expect(span.setAttributes).toHaveBeenLastCalledWith({
      'sentry.segment.name.source': 'url',
      'url.path': '/performance/',
      'url.full': 'https://example.com/performance/',
    });
  });
});
