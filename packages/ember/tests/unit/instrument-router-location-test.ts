import { setupTest } from 'ember-qunit';
import { module, test } from 'qunit';
import { setupSentryTest } from '../helpers/setup-sentry.ts';

import type { SentryTestContext } from '../helpers/setup-sentry.ts';

interface Location {
  formatURL?: (url: string) => string;
  getURL?: () => string;
  implementation?: string;
  rootURL: string;
}

function getLocationURL(location: Location): string {
  if (!location?.getURL || !location?.formatURL) {
    return '';
  }

  const url = location.formatURL(location.getURL());

  if (location.implementation === 'hash' || url.startsWith('#')) {
    return `${location.rootURL}${url}`;
  }

  return url;
}

module('Unit | Utility | instrument-router-location', function (hooks) {
  setupTest(hooks);
  setupSentryTest(hooks);

  test('getLocationURL handles hash location without implementation field', function (this: SentryTestContext, assert) {
    // This simulates the default Ember HashLocation which doesn't include the implementation field
    const mockLocation: Location = {
      getURL: () => '#/test-route',
      formatURL: (url: string) => url,
      rootURL: '/',
    };

    const result = getLocationURL(mockLocation);
    assert.strictEqual(
      result,
      '/#/test-route',
      'Should prepend rootURL to hash URL when implementation is not set',
    );
  });

  test('getLocationURL handles hash location with implementation field', function (this: SentryTestContext, assert) {
    // This simulates a custom HashLocation with explicit implementation field
    const mockLocation: Location = {
      getURL: () => '#/test-route',
      formatURL: (url: string) => url,
      implementation: 'hash',
      rootURL: '/',
    };

    const result = getLocationURL(mockLocation);
    assert.strictEqual(
      result,
      '/#/test-route',
      'Should prepend rootURL to hash URL when implementation is hash',
    );
  });

  test('getLocationURL handles history location', function (this: SentryTestContext, assert) {
    // This simulates a history location
    const mockLocation: Location = {
      getURL: () => '/test-route',
      formatURL: (url: string) => url,
      implementation: 'history',
      rootURL: '/',
    };

    const result = getLocationURL(mockLocation);
    assert.strictEqual(
      result,
      '/test-route',
      'Should return URL as-is for non-hash locations',
    );
  });

  test('getLocationURL handles none location type', function (this: SentryTestContext, assert) {
    // This simulates a 'none' location (often used in tests)
    const mockLocation: Location = {
      getURL: () => '',
      formatURL: (url: string) => url,
      implementation: 'none',
      rootURL: '/',
    };

    const result = getLocationURL(mockLocation);
    assert.strictEqual(
      result,
      '',
      'Should return empty string when URL is empty',
    );
  });

  test('getLocationURL handles custom rootURL for hash location', function (this: SentryTestContext, assert) {
    // Test with non-root rootURL
    const mockLocation: Location = {
      getURL: () => '#/test-route',
      formatURL: (url: string) => url,
      rootURL: '/my-app/',
    };

    const result = getLocationURL(mockLocation);
    assert.strictEqual(
      result,
      '/my-app/#/test-route',
      'Should prepend custom rootURL to hash URL when implementation is not set',
    );
  });

  test('getLocationURL handles location without getURL method', function (this: SentryTestContext, assert) {
    // This simulates an incomplete location object
    const mockLocation: Location = {
      formatURL: (url: string) => url,
      rootURL: '/',
    };

    const result = getLocationURL(mockLocation);
    assert.strictEqual(
      result,
      '',
      'Should return empty string when getURL is not available',
    );
  });

  test('getLocationURL handles location without formatURL method', function (this: SentryTestContext, assert) {
    // This simulates an incomplete location object
    const mockLocation: Location = {
      getURL: () => '#/test-route',
      rootURL: '/',
    };

    const result = getLocationURL(mockLocation);
    assert.strictEqual(
      result,
      '',
      'Should return empty string when formatURL is not available',
    );
  });
});
