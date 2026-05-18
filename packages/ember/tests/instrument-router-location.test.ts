import { describe, expect, it } from 'vitest';
import { getLocationURL } from '../src/utils/instrumentEmberAppInstanceForPerformance.ts';

interface Location {
  formatURL?: (url: string) => string;
  getURL?: () => string;
  implementation?: string;
  rootURL: string;
}

describe('getLocationURL', () => {
  it('handles hash location without implementation field', () => {
    const mockLocation: Location = {
      getURL: () => '#/test-route',
      formatURL: (url: string) => url,
      rootURL: '/',
    };

    expect(getLocationURL(mockLocation)).toBe('/#/test-route');
  });

  it('handles hash location with implementation field', () => {
    const mockLocation: Location = {
      getURL: () => '#/test-route',
      formatURL: (url: string) => url,
      implementation: 'hash',
      rootURL: '/',
    };

    expect(getLocationURL(mockLocation)).toBe('/#/test-route');
  });

  it('handles history location', () => {
    const mockLocation: Location = {
      getURL: () => '/test-route',
      formatURL: (url: string) => url,
      implementation: 'history',
      rootURL: '/',
    };

    expect(getLocationURL(mockLocation)).toBe('/test-route');
  });

  it('handles none location type', () => {
    const mockLocation: Location = {
      getURL: () => '',
      formatURL: (url: string) => url,
      implementation: 'none',
      rootURL: '/',
    };

    expect(getLocationURL(mockLocation)).toBe('');
  });

  it('handles custom rootURL for hash location', () => {
    const mockLocation: Location = {
      getURL: () => '#/test-route',
      formatURL: (url: string) => url,
      rootURL: '/my-app/',
    };

    expect(getLocationURL(mockLocation)).toBe('/my-app/#/test-route');
  });

  it('handles location without getURL method', () => {
    const mockLocation: Location = {
      formatURL: (url: string) => url,
      rootURL: '/',
    };

    expect(getLocationURL(mockLocation)).toBe('');
  });

  it('handles location without formatURL method', () => {
    const mockLocation: Location = {
      getURL: () => '#/test-route',
      rootURL: '/',
    };

    expect(getLocationURL(mockLocation)).toBe('');
  });
});
