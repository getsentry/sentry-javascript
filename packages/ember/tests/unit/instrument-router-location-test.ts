import type { EmberRouterMain } from '@sentry/ember/addon/types';
import { _getLocationURL } from '@sentry/ember/instance-initializers/sentry-performance';
import { setupTest } from 'ember-qunit';
import { module, test } from 'qunit';
import type { SentryTestContext } from '../helpers/setup-sentry';
import { setupSentryTest } from '../helpers/setup-sentry';

module('Unit | Utility | instrument-router-location', function (hooks) {
  setupTest(hooks);
  setupSentryTest(hooks);

  test('getLocationURL handles hash location without implementation field', function (this: SentryTestContext, assert) {
    // This simulates the default Ember HashLocation which doesn't include the implementation field
    const mockLocation: EmberRouterMain['location'] = {
      getURL: () => '#/test-route',
      formatURL: (url: string) => url,
      rootURL: '/',
    };

    const result = _getLocationURL(mockLocation);
    assert.strictEqual(result, '/#/test-route', 'Should prepend rootURL to hash URL when implementation is not set');
  });

  test('_getLocationURL handles hash location with implementation field', function (this: SentryTestContext, assert) {
    // This simulates a custom HashLocation with explicit implementation field
    const mockLocation: EmberRouterMain['location'] = {
      getURL: () => '#/test-route',
      formatURL: (url: string) => url,
      implementation: 'hash',
      rootURL: '/',
    };

    const result = _getLocationURL(mockLocation);
    assert.strictEqual(result, '/#/test-route', 'Should prepend rootURL to hash URL when implementation is hash');
  });

  test('_getLocationURL handles history location', function (this: SentryTestContext, assert) {
    // This simulates a history location
    const mockLocation: EmberRouterMain['location'] = {
      getURL: () => '/test-route',
      formatURL: (url: string) => url,
      implementation: 'history',
      rootURL: '/',
    };

    const result = _getLocationURL(mockLocation);
    assert.strictEqual(result, '/test-route', 'Should return URL as-is for non-hash locations');
  });

  test('_getLocationURL handles none location type', function (this: SentryTestContext, assert) {
    // This simulates a 'none' location (often used in tests)
    const mockLocation: EmberRouterMain['location'] = {
      getURL: () => '',
      formatURL: (url: string) => url,
      implementation: 'none',
      rootURL: '/',
    };

    const result = _getLocationURL(mockLocation);
    assert.strictEqual(result, '', 'Should return empty string when URL is empty');
  });

  test('_getLocationURL handles custom rootURL for hash location', function (this: SentryTestContext, assert) {
    // Test with non-root rootURL
    const mockLocation: EmberRouterMain['location'] = {
      getURL: () => '#/test-route',
      formatURL: (url: string) => url,
      rootURL: '/my-app/',
    };

    const result = _getLocationURL(mockLocation);
    assert.strictEqual(
      result,
      '/my-app/#/test-route',
      'Should prepend custom rootURL to hash URL when implementation is not set',
    );
  });

  test('_getLocationURL handles location without getURL method', function (this: SentryTestContext, assert) {
    // This simulates an incomplete location object
    const mockLocation: EmberRouterMain['location'] = {
      formatURL: (url: string) => url,
      rootURL: '/',
    };

    const result = _getLocationURL(mockLocation);
    assert.strictEqual(result, '', 'Should return empty string when getURL is not available');
  });

  test('_getLocationURL handles location without formatURL method', function (this: SentryTestContext, assert) {
    // This simulates an incomplete location object
    const mockLocation: EmberRouterMain['location'] = {
      getURL: () => '#/test-route',
      rootURL: '/',
    };

    const result = _getLocationURL(mockLocation);
    assert.strictEqual(result, '', 'Should return empty string when formatURL is not available');
  });
});
