import type { ActivatedRouteSnapshot } from '@angular/router';
import { URL_FULL, URL_PATH, URL_TEMPLATE, SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';

import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SentrySpan, spanToJSON } from '@sentry/core';
import { describe, it } from 'vitest';
import { browserTracingIntegration, init, TraceDirective } from '../src/index';
import { _updateSpanAttributesForParametrizedUrl, getParameterizedRouteFromSnapshot } from '../src/tracing';
import { expect } from 'vitest';

describe('browserTracingIntegration', () => {
  it('implements required hooks', () => {
    const integration = browserTracingIntegration();
    expect(integration.name).toEqual('BrowserTracing');
  });
});

describe('Angular Tracing', () => {
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

      const route = '/users/:id/';
      const url = '/users/123/';
      const span = new SentrySpan({ name: 'initial-span-name' });
      span.setAttribute(SENTRY_SEGMENT_NAME_SOURCE, 'url');

      _updateSpanAttributesForParametrizedUrl(route, url, span);

      expect(spanToJSON(span)).toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.undefined.angular',
            [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
            [URL_TEMPLATE]: route,
            // URL_FULL is resolved against jsdom's http://localhost origin
            [URL_FULL]: expect.stringContaining('/users/123/'),
            [URL_PATH]: '/users/123/',
          }),
          description: route,
        }),
      );
    });

    it('does not change the span name if the source is something other than `url`', async () => {
      init({ integrations: [browserTracingIntegration()] });

      const route = '/users/:id/';
      const url = '/users/123/';
      const span = new SentrySpan({ name: 'initial-span-name' });
      span.setAttribute(SENTRY_SEGMENT_NAME_SOURCE, 'sample-source');

      _updateSpanAttributesForParametrizedUrl(route, url, span);

      expect(spanToJSON(span)).toEqual(
        expect.objectContaining({
          data: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
            [SENTRY_SEGMENT_NAME_SOURCE]: 'sample-source',
          },
          description: 'initial-span-name',
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
