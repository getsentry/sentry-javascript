import type { ActivatedRouteSnapshot } from '@angular/router';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, SentrySpan, spanToJSON } from '@sentry/core';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/browser';
import { TraceDirective, browserTracingIntegration, init } from '../src/index';
import { _updateSpanAttributesForParametrizedUrl, getParameterizedRouteFromSnapshot } from '../src/tracing';

let transaction: any;

jest.mock('@sentry/browser', () => {
  const original = jest.requireActual('@sentry/browser');
  return {
    ...original,
    getCurrentScope() {
      return {
        getTransaction: () => {
          return transaction;
        },
      };
    },
  };
});

describe('browserTracingIntegration', () => {
  it('implements required hooks', () => {
    const integration = browserTracingIntegration();
    expect(integration.name).toEqual('BrowserTracing');
    expect(integration.setupOnce).toBeDefined();
    expect(integration.afterAllSetup).toBeDefined();
  });
});

describe('Angular Tracing', () => {
  beforeEach(() => {
    transaction = undefined;
  });

  describe('getParameterizedRouteFromSnapshot', () => {
    it.each([
      ['returns `/` if the route has no children', {}, '/'],
      [
        'returns `/` if the route has an empty child',
        {
          firstChild: { routeConfig: { path: '' } },
        },
        '/',
      ],
      [
        'returns the route of a snapshot without children',
        {
          firstChild: { routeConfig: { path: 'users/:id' } },
        },
        '/users/:id/',
      ],
      [
        'returns the complete route of a snapshot with children',
        {
          firstChild: {
            routeConfig: { path: 'orgs/:orgId' },
            firstChild: {
              routeConfig: { path: 'projects/:projId' },
              firstChild: { routeConfig: { path: 'overview' } },
            },
          },
        },
        '/orgs/:orgId/projects/:projId/overview/',
      ],
      [
        'returns the route of a snapshot without children but with empty paths',
        {
          firstChild: {
            routeConfig: { path: 'users' },
            firstChild: {
              routeConfig: { path: '' },
              firstChild: {
                routeConfig: { path: ':id' },
              },
            },
          },
        },
        '/users/:id/',
      ],
    ])('%s', (_, routeSnapshot, expectedParams) => {
      expect(getParameterizedRouteFromSnapshot(routeSnapshot as unknown as ActivatedRouteSnapshot)).toEqual(
        expectedParams,
      );
    });
  });

  describe('TraceService', () => {
    it('change the span name to route name if the the source is `url`', async () => {
      init({ integrations: [browserTracingIntegration()] });

      const route = 'sample-route';
      const span = new SentrySpan({ name: 'initial-span-name' });
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'url');

      _updateSpanAttributesForParametrizedUrl(route, span);

      expect(spanToJSON(span)).toEqual(
        expect.objectContaining({
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.undefined.angular',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          },
          description: route,
        }),
      );
    });

    it('does not change the span name if the source is something other than `url`', async () => {
      init({ integrations: [browserTracingIntegration()] });

      const route = 'sample-route';
      const span = new SentrySpan({ name: 'initial-span-name' });
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'sample-source');

      _updateSpanAttributesForParametrizedUrl(route, span);

      expect(spanToJSON(span)).toEqual(
        expect.objectContaining({
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'sample-source',
          },
          description: 'initial-span-name',
        }),
      );
    });

    it('should contain the keys "test1" and "test2"', () => {
      const obj = { test1: 'value1', test2: 'value2', otherKey: 'otherValue', ll: { sdf: 'sdfsd' } };

      expect(obj).toEqual(
        expect.objectContaining({
          test1: 'value1',
          ll: { sdf: 'sdfsd' },
        }),
      );
    });
  });

  describe('TraceDirective', () => {
    it('should create an instance', () => {
      const directive = new TraceDirective();
      expect(directive).toBeTruthy();
    });
  });
});
