import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeNavigationSpanFromRouterState,
  resolveNavigateAbsoluteUrl,
  updateNavigationSpanUrlFromLocation,
} from '../../src/client/utils';

vi.mock('@sentry/browser', () => ({
  getAbsoluteUrl: vi.fn((urlOrPath: string) => {
    try {
      return new URL(urlOrPath, 'https://example.com').toString();
    } catch {
      return urlOrPath;
    }
  }),
}));

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
      'url.path': '/foo',
      'url.full': 'https://example.com/foo?bar=1#section',
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
      matches: [{ route: { path: '' } }],
      navigation: { state: 'idle' },
    } as any);

    expect(span.updateName).toHaveBeenLastCalledWith('/performance');
    expect(span.setAttributes).toHaveBeenLastCalledWith({
      'sentry.source': 'route',
      'url.template': '/performance',
    });
  });

  it('sets navigation.route.id from the leaf matched route id', () => {
    const span = { updateName: vi.fn(), setAttributes: vi.fn() } as any;

    finalizeNavigationSpanFromRouterState(span, {
      location: { pathname: '/performance/' },
      matches: [{ route: { path: '', id: 'routes/performance/index' } }],
      navigation: { state: 'idle' },
    } as any);

    expect(span.setAttributes).toHaveBeenLastCalledWith({
      'sentry.source': 'route',
      'url.template': '/performance',
      'navigation.route.id': 'routes/performance/index',
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
      'url.path': '/performance/',
      'url.full': 'https://example.com/performance/',
    });
    expect(span.setAttributes).toHaveBeenCalledTimes(1);
  });
});
