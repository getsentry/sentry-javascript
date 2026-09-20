import type ApplicationInstance from '@ember/application/instance';
import type Transition from '@ember/routing/transition';
import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { getCurrentScope, SentrySpan, spanToJSON, type Client, type StartSpanOptions } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentEmberAppInstanceForPerformance } from '../src/utils/instrumentEmberAppInstanceForPerformance.ts';

function createRouterFixture() {
  const handlers = new Map<string, (transition: Transition) => void>();
  const router = {
    recognize: vi.fn<() => { name: string; params: Record<string, string> } | undefined>().mockReturnValue({
      name: 'index',
      params: {},
    }),
    currentRouteName: undefined as string | undefined,
    currentURL: '/',
    on: (event: string, callback: (transition: Transition) => void) => handlers.set(event, callback),
  };
  const location = {
    rootURL: '/',
    getURL: () => '/',
    formatURL: (url: string) => url,
  };
  const appInstance = {
    lookup: (name: string) => (name === 'service:router' ? router : { location }),
  } as unknown as ApplicationInstance;
  const client = {
    getOptions: () => ({ traceLifecycle: 'stream' }),
    getDataCollectionOptions: () => ({ urlQueryParams: true }),
  } as unknown as Client;
  const pageloadSpan = new SentrySpan({ name: 'Pageload' });
  const navigationSpan = new SentrySpan({ name: 'Navigation' });
  const startPageloadSpan = vi.fn((_client: Client, options: StartSpanOptions) => {
    pageloadSpan.updateName(options.name);
    pageloadSpan.setAttributes(options.attributes ?? {});
    return pageloadSpan;
  });
  const startNavigationSpan = vi.fn((_client: Client, options: StartSpanOptions) => {
    navigationSpan.updateName(options.name);
    navigationSpan.setAttributes(options.attributes ?? {});
    return navigationSpan;
  });

  return {
    client,
    router,
    pageloadSpan,
    navigationSpan,
    startPageloadSpan,
    startNavigationSpan,
    instrument: (config: Parameters<typeof instrumentEmberAppInstanceForPerformance>[2] = {}) =>
      instrumentEmberAppInstanceForPerformance(client, appInstance, config, startPageloadSpan, startNavigationSpan),
    routeWillChange: (transition: { from?: { name: string }; to?: { name?: string; localName?: string } }) => {
      const handler = handlers.get('routeWillChange');
      if (!handler) {
        throw new Error('routeWillChange was not registered');
      }
      handler(transition as Transition);
    },
  };
}

describe('instrumentEmberAppInstanceForPerformance', () => {
  let previousTransactionName: string | undefined;

  beforeEach(() => {
    previousTransactionName = getCurrentScope().getScopeData().transactionName;
    getCurrentScope().setTransactionName(undefined);
    vi.stubGlobal('location', { origin: 'https://ember.example.com', pathname: '/' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    getCurrentScope().setTransactionName(previousTransactionName);
  });

  it('adds the recognized route ID to the pageload', () => {
    const fixture = createRouterFixture();

    fixture.instrument();

    expect(fixture.startPageloadSpan).toHaveBeenCalledExactlyOnceWith(fixture.client, {
      name: 'route:index',
      attributes: {
        [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
        'sentry.origin': 'auto.pageload.ember',
        'router.navigation.route.id': 'index',
        'url.path': '/',
        'url.full': 'https://ember.example.com/',
        'url.template': '/',
        toRoute: 'index',
      },
    });
  });

  it('omits the pageload route ID when the recognized name is empty', () => {
    const fixture = createRouterFixture();
    fixture.router.recognize.mockReturnValue({ name: '', params: {} });

    fixture.instrument();

    expect(fixture.startPageloadSpan).toHaveBeenCalledTimes(1);
    expect(spanToJSON(fixture.pageloadSpan).attributes).not.toHaveProperty('router.navigation.route.id');
  });

  it.each([true, false])('updates the initial pageload when navigation instrumentation is %s', instrumentNavigation => {
    const fixture = createRouterFixture();
    fixture.router.recognize.mockReturnValue(undefined);
    fixture.instrument({ instrumentNavigation });
    expect(spanToJSON(fixture.pageloadSpan).name).toBe('Pageload');
    expect(spanToJSON(fixture.pageloadSpan).attributes).not.toHaveProperty('router.navigation.route.id');

    fixture.routeWillChange({ to: { name: 'index' } });

    expect(fixture.startPageloadSpan).toHaveBeenCalledTimes(1);
    expect(fixture.startNavigationSpan).not.toHaveBeenCalled();
    expect(spanToJSON(fixture.pageloadSpan).name).toBe('route:index');
    expect(spanToJSON(fixture.pageloadSpan).attributes['router.navigation.route.id']).toBe('index');
    expect(spanToJSON(fixture.pageloadSpan).attributes[SENTRY_SEGMENT_NAME_SOURCE]).toBe('route');
  });

  it('adds the destination route ID without a destination URL', () => {
    const fixture = createRouterFixture();
    fixture.instrument();

    fixture.routeWillChange({ from: { name: 'index' }, to: { name: 'tracing' } });

    expect(fixture.startNavigationSpan).toHaveBeenCalledExactlyOnceWith(fixture.client, {
      name: 'route:tracing',
      attributes: {
        [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
        'sentry.origin': 'auto.navigation.ember',
        'router.navigation.route.id': 'tracing',
        fromRoute: 'index',
        toRoute: 'tracing',
      },
    });
  });

  it('uses the current route fallback when the transition has no destination', () => {
    const fixture = createRouterFixture();
    fixture.router.currentRouteName = 'tracing';
    fixture.instrument();

    fixture.routeWillChange({ from: { name: 'index' } });

    expect(spanToJSON(fixture.navigationSpan).attributes['router.navigation.route.id']).toBe('tracing');
  });

  it.each([undefined, ''])('omits the navigation route ID when the available name is %j', currentRouteName => {
    const fixture = createRouterFixture();
    fixture.router.currentRouteName = currentRouteName;
    fixture.instrument();

    fixture.routeWillChange({ from: { name: 'index' } });

    expect(fixture.startNavigationSpan).toHaveBeenCalledExactlyOnceWith(fixture.client, {
      name: `route:${currentRouteName}`,
      attributes: {
        [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
        'sentry.origin': 'auto.navigation.ember',
        fromRoute: 'index',
        toRoute: currentRouteName,
      },
    });
  });

  it.each([undefined, ''])('preserves a caller route ID when the delayed pageload name is %j', currentRouteName => {
    const fixture = createRouterFixture();
    fixture.router.currentRouteName = currentRouteName;
    fixture.router.recognize.mockReturnValue(undefined);
    fixture.instrument();
    fixture.pageloadSpan.setAttribute('router.navigation.route.id', 'caller-route');
    const updateName = vi.spyOn(fixture.pageloadSpan, 'updateName');
    const setAttributes = vi.spyOn(fixture.pageloadSpan, 'setAttributes');

    fixture.routeWillChange({});

    expect(updateName).toHaveBeenCalledExactlyOnceWith(`route:${currentRouteName}`);
    expect(setAttributes).toHaveBeenCalledExactlyOnceWith({
      [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
      'url.path': '/',
      'url.full': 'https://ember.example.com/',
      'url.template': '/',
      toRoute: currentRouteName,
    });
    expect(spanToJSON(fixture.pageloadSpan).attributes['router.navigation.route.id']).toBe('caller-route');
  });

  it('does not create a pageload when pageload instrumentation is disabled', () => {
    const fixture = createRouterFixture();

    fixture.instrument({ instrumentPageLoad: false });
    fixture.routeWillChange({ to: { name: 'index' } });

    expect(fixture.startPageloadSpan).not.toHaveBeenCalled();
    expect(fixture.startNavigationSpan).not.toHaveBeenCalled();
  });

  it('does not create a navigation when navigation instrumentation is disabled', () => {
    const fixture = createRouterFixture();
    fixture.instrument({ instrumentNavigation: false });

    fixture.routeWillChange({ from: { name: 'index' }, to: { name: 'tracing' } });

    expect(fixture.startNavigationSpan).not.toHaveBeenCalled();
  });

  it.each(['loading', 'error'])('does not create a navigation for an intermediate %s route', localName => {
    const fixture = createRouterFixture();
    fixture.instrument();
    const endPageload = vi.spyOn(fixture.pageloadSpan, 'end');

    fixture.routeWillChange({ from: { name: 'index' }, to: { name: `tracing.${localName}`, localName } });

    expect(endPageload).not.toHaveBeenCalled();
    expect(fixture.startNavigationSpan).not.toHaveBeenCalled();
  });
});
