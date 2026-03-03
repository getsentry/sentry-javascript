import * as core from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureInstrumentationError,
  getPathFromRequest,
  getPattern,
  normalizeRoutePath,
} from '../../src/common/utils';

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual<typeof core>('@sentry/core');
  return {
    ...actual,
    captureException: vi.fn(),
  };
});

describe('getPathFromRequest', () => {
  it('should extract pathname from valid absolute URL', () => {
    const request = { url: 'http://example.com/users/123' };
    expect(getPathFromRequest(request)).toBe('/users/123');
  });

  it('should extract pathname from relative URL using dummy base', () => {
    const request = { url: '/api/data' };
    expect(getPathFromRequest(request)).toBe('/api/data');
  });

  it('should handle malformed URLs by treating them as relative paths', () => {
    // The dummy base URL fallback handles most strings as relative paths
    // This verifies the fallback works even for unusual URL strings
    const request = { url: ':::invalid:::' };
    expect(getPathFromRequest(request)).toBe('/:::invalid:::');
  });

  it('should handle URL with query string', () => {
    const request = { url: 'http://example.com/search?q=test' };
    expect(getPathFromRequest(request)).toBe('/search');
  });

  it('should handle URL with fragment', () => {
    const request = { url: 'http://example.com/page#section' };
    expect(getPathFromRequest(request)).toBe('/page');
  });

  it('should handle root path', () => {
    const request = { url: 'http://example.com/' };
    expect(getPathFromRequest(request)).toBe('/');
  });
});

describe('getPattern', () => {
  it('should prefer stable pattern over unstable_pattern', () => {
    const info = { pattern: '/users/:id', unstable_pattern: '/old/:id' };
    expect(getPattern(info)).toBe('/users/:id');
  });

  it('should fall back to unstable_pattern when pattern is undefined', () => {
    const info = { unstable_pattern: '/users/:id' };
    expect(getPattern(info)).toBe('/users/:id');
  });

  it('should return undefined when neither is available', () => {
    const info = {};
    expect(getPattern(info)).toBeUndefined();
  });
});

describe('normalizeRoutePath', () => {
  it('should add leading slash if missing', () => {
    expect(normalizeRoutePath('users/:id')).toBe('/users/:id');
  });

  it('should keep existing leading slash', () => {
    expect(normalizeRoutePath('/users/:id')).toBe('/users/:id');
  });

  it('should return undefined for falsy input', () => {
    expect(normalizeRoutePath(undefined)).toBeUndefined();
    expect(normalizeRoutePath('')).toBeUndefined();
  });
});

describe('captureInstrumentationError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should capture error when captureErrors is true', () => {
    const error = new Error('test error');
    const result = { status: 'error' as const, error };
    const data = { 'http.url': '/test' };

    captureInstrumentationError(result, true, 'react_router.loader', data);

    expect(core.captureException).toHaveBeenCalledWith(error, {
      mechanism: { type: 'react_router.loader', handled: false, data },
    });
  });

  it('should not capture error when captureErrors is false', () => {
    const error = new Error('test error');
    const result = { status: 'error' as const, error };

    captureInstrumentationError(result, false, 'react_router.loader', {});

    expect(core.captureException).not.toHaveBeenCalled();
  });
});
