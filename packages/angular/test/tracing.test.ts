import { ElementRef } from '@angular/core';
import type { ActivatedRouteSnapshot } from '@angular/router';
import {
  getMainCarrier,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SentrySpan,
  spanToJSON,
  startSpan,
  UI_COMPONENT_SPAN_NAME_FALLBACK,
} from '@sentry/core';
import { describe, it } from 'vitest';
import { browserTracingIntegration, init, TraceClass, TraceDirective } from '../src/index';
import { _updateSpanAttributesForParametrizedUrl, getParameterizedRouteFromSnapshot } from '../src/tracing';
import { SENTRY_SEGMENT_NAME_SOURCE, URL_FULL, URL_PATH, URL_TEMPLATE } from '@sentry/conventions/attributes';
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
          attributes: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.undefined.angular',
            [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
            [URL_TEMPLATE]: route,
            // URL_FULL is resolved against jsdom's http://localhost origin
            [URL_FULL]: expect.stringContaining('/users/123/'),
            [URL_PATH]: '/users/123/',
          }),
          name: route,
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
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'manual',
            [SENTRY_SEGMENT_NAME_SOURCE]: 'sample-source',
          },
          name: 'initial-span-name',
        }),
      );
    });
  });

  describe('TraceDirective', () => {
    it('should create an instance', () => {
      const directive = new TraceDirective();
      expect(directive).toBeTruthy();
    });

    it('uses the UI component fallback for a selector-derived name when span streaming is enabled', () => {
      getMainCarrier().__SENTRY__ = undefined;
      const spans: SentrySpan[] = [];
      const client = init({ defaultIntegrations: false, tracesSampleRate: 1, traceLifecycle: 'stream' });
      client?.on('spanEnd', span => {
        if (spanToJSON(span).attributes['sentry.origin'] === 'auto.ui.angular.trace_directive') {
          spans.push(span as SentrySpan);
        }
      });

      startSpan({ name: 'outer' }, () => {
        const directive = new TraceDirective(new ElementRef(document.createElement('app-profile')));
        directive.ngOnInit();
        directive.ngAfterViewInit();
      });

      expect(spans).toHaveLength(1);
      expect(spanToJSON(spans[0]!).name).toBe(UI_COMPONENT_SPAN_NAME_FALLBACK);
      expect(spanToJSON(spans[0]!).attributes['sentry.description']).toBe('<app-profile>');
      expect(spanToJSON(spans[0]!).attributes['ui.component_name']).toBeUndefined();
    });
  });

  describe('TraceClass', () => {
    it('uses the decorated class name when span streaming is enabled', () => {
      getMainCarrier().__SENTRY__ = undefined;
      const spans: SentrySpan[] = [];
      const client = init({ defaultIntegrations: false, tracesSampleRate: 1, traceLifecycle: 'stream' });
      client?.on('spanEnd', span => {
        if (spanToJSON(span).attributes['sentry.origin'] === 'auto.ui.angular.trace_class_decorator') {
          spans.push(span as SentrySpan);
        }
      });

      class ProfileCard {
        public ngOnInit(): void {}
        public ngAfterViewInit(): void {}
      }
      TraceClass()(ProfileCard);

      startSpan({ name: 'outer' }, () => {
        const instance = new ProfileCard();
        instance.ngOnInit();
        instance.ngAfterViewInit();
      });

      expect(spans).toHaveLength(1);
      expect(spanToJSON(spans[0]!).name).toBe('ProfileCard');
      expect(spanToJSON(spans[0]!).attributes['sentry.description']).toBe('<unnamed>');
      expect(spanToJSON(spans[0]!).attributes['ui.component_name']).toBe('ProfileCard');
    });

    it('tracks lifecycle spans independently for concurrent component instances', () => {
      getMainCarrier().__SENTRY__ = undefined;
      const spans: SentrySpan[] = [];
      const client = init({ defaultIntegrations: false, tracesSampleRate: 1 });
      client?.on('spanEnd', span => {
        if (spanToJSON(span).attributes['sentry.origin'] === 'auto.ui.angular.trace_class_decorator') {
          spans.push(span as SentrySpan);
        }
      });

      class ProfileCard {
        public ngOnInit(): void {}
        public ngAfterViewInit(): void {}
      }
      TraceClass({ name: 'ProfileCard' })(ProfileCard);

      startSpan({ name: 'outer' }, () => {
        const first = new ProfileCard();
        const second = new ProfileCard();
        first.ngOnInit();
        second.ngOnInit();
        first.ngAfterViewInit();
        second.ngAfterViewInit();
      });

      expect(spans).toHaveLength(2);
    });
  });
});
