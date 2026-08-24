import type { AfterViewInit, OnDestroy, OnInit } from '@angular/core';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ElementRef } from '@angular/core';
import { Directive, Injectable, Input, NgModule } from '@angular/core';
import type { ActivatedRouteSnapshot, Event, RouterState } from '@angular/router';
// Duplicated import to work around a TypeScript bug where it'd complain that `Router` isn't imported as a type.
// We need to import it as a value to satisfy Angular dependency injection. So:
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NavigationCancel, NavigationError, Router } from '@angular/router';
import { NavigationEnd, NavigationStart, ResolveEnd } from '@angular/router';
import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  getActiveSpan,
  getClient,
  getCurrentScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
  startBrowserTracingNavigationSpan,
  startInactiveSpan,
  getAbsoluteUrl,
} from '@sentry/browser';
import {
  SENTRY_SEGMENT_NAME_SOURCE,
  CODE_FUNCTION_NAME,
  SENTRY_OP,
  URL_FULL,
  URL_PATH,
  URL_TEMPLATE,
} from '@sentry/conventions/attributes';
import { FUNCTION, ROUTER } from '@sentry/conventions/op';
import type { Integration, Span } from '@sentry/core';
import {
  createCachedRouteProvider,
  debug,
  hasSpanStreamingEnabled,
  NAVIGATION_SPAN_NAME_FALLBACK,
  parseStringToURLObject,
  ROUTER_SPAN_NAME_FALLBACK,
  setRouteProvider,
  stripUrlQueryAndFragment,
  timestampInSeconds,
  filterCollectedUrl,
} from '@sentry/core';
import type { Observable } from 'rxjs';
import { Subscription } from 'rxjs';
import { filter, tap } from 'rxjs/operators';
import { UI_MOUNT } from '@sentry/conventions/op';
import { IS_DEBUG_BUILD } from './flags';
import { runOutsideAngular } from './zone';

let instrumentationInitialized: boolean;

// The parameterized route only exists on Angular's `ResolveEnd` event, resolved from the router
// state snapshot, so there is no matcher the integration could call. `TraceService` records each
// route as it resolves and the provider answers from that.
const ROUTE_PROVIDER = createCachedRouteProvider();

/**
 * A custom browser tracing integration for Angular.
 *
 * Use this integration in combination with `TraceService`
 */
export function browserTracingIntegration(
  options: Parameters<typeof originalBrowserTracingIntegration>[0] = {},
): Integration {
  // If the user opts out to set this up, we just don't initialize this.
  // That way, the TraceService will not actually do anything, functionally disabling this.
  if (options.instrumentNavigation !== false) {
    instrumentationInitialized = true;
  }

  const integration = originalBrowserTracingIntegration({
    ...options,
    instrumentNavigation: false,
  });

  return {
    ...integration,
    setup(client) {
      setRouteProvider(ROUTE_PROVIDER, client);
      integration.setup?.(client);
    },
  };
}

/**
 * This function is extracted to make unit testing easier.
 */
export function _updateSpanAttributesForParametrizedUrl(route: string, url: string, span?: Span): void {
  if (!span) {
    return;
  }

  const attributes = spanToJSON(span).attributes;

  if (!attributes || attributes[SENTRY_SEGMENT_NAME_SOURCE] === 'url') {
    span.updateName(route);

    const absoluteUrl = getAbsoluteUrl(url);

    span.setAttributes({
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: `auto.${attributes[SENTRY_OP]}.angular`,
      [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
      [URL_FULL]: filterCollectedUrl(absoluteUrl),
      [URL_PATH]: parseStringToURLObject(absoluteUrl)?.pathname,
      [URL_TEMPLATE]: route,
    });
  }
}

/**
 * Angular's Service responsible for hooking into Angular Router and tracking current navigation process.
 * Creates a new transaction for every route change and measures a duration of routing process.
 */
@Injectable({ providedIn: 'root' })
export class TraceService implements OnDestroy {
  public navStart$: Observable<Event> = this._router.events.pipe(
    filter((event): event is NavigationStart => event instanceof NavigationStart),
    tap(navigationEvent => {
      if (!instrumentationInitialized) {
        IS_DEBUG_BUILD &&
          debug.error('Angular integration has tracing enabled, but Tracing integration is not configured');
        return;
      }

      if (this._routingSpan) {
        this._routingSpan.end();
        this._routingSpan = null;
      }

      const client = getClient();
      const strippedUrl = stripUrlQueryAndFragment(navigationEvent.url);

      if (client) {
        // see comment in `_isPageloadOngoing` for rationale
        if (!this._isPageloadOngoing()) {
          runOutsideAngular(() => {
            startBrowserTracingNavigationSpan(
              client,
              {
                // With span streaming, span names have to be low cardinality. The parameterized route
                // is only known on `ResolveEnd`, which updates the span name then.
                name: hasSpanStreamingEnabled(client) ? NAVIGATION_SPAN_NAME_FALLBACK : strippedUrl,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.angular',
                  [SENTRY_SEGMENT_NAME_SOURCE]: 'url',
                },
              },
              {
                url: getAbsoluteUrl(navigationEvent.url),
              },
            );
          });
        } else {
          // The first time we end up here, we set the pageload flag to false
          // Subsequent navigations are going to get their own navigation root span
          // even if the pageload root span is still ongoing.
          this._pageloadOngoing = false;
        }

        this._routingSpan =
          runOutsideAngular(() =>
            startInactiveSpan({
              // With span streaming, span names have to be low cardinality. The parameterized route is only
              // known at `ResolveEnd`, well after this span starts, so there is nothing but the fallback.
              name: hasSpanStreamingEnabled(client) ? ROUTER_SPAN_NAME_FALLBACK : `${navigationEvent.url}`,
              attributes: {
                [SENTRY_OP]: ROUTER,
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.angular',
                [URL_FULL]: strippedUrl,
                ...(navigationEvent.navigationTrigger && {
                  navigationTrigger: navigationEvent.navigationTrigger,
                }),
              },
            }),
          ) || null;

        return;
      }
    }),
  );

  // The ResolveEnd event is fired when the Angular router has resolved the URL and
  // the parameter<->value mapping. It holds the new resolved router state with
  // the mapping and the new URL.
  // Only After this event, the route is activated, meaning that the transaction
  // can be updated with the parameterized route name before e.g. the route's root
  // component is initialized. This should be early enough before outgoing requests
  // are made from the new route, with the exceptions of requests being made during
  // a navigation.
  public resEnd$: Observable<Event> = this._router.events.pipe(
    filter((event): event is ResolveEnd => event instanceof ResolveEnd),
    tap(event => {
      const route = getParameterizedRouteFromSnapshot(
        (event.state as unknown as RouterState & { root: ActivatedRouteSnapshot }).root,
      );

      if (route) {
        ROUTE_PROVIDER.record(stripUrlQueryAndFragment(event.urlAfterRedirects), route);
        getCurrentScope().setTransactionName(route);
      }

      const activeSpan = getActiveSpan();
      const rootSpan = activeSpan && getRootSpan(activeSpan);

      _updateSpanAttributesForParametrizedUrl(route, event.urlAfterRedirects, rootSpan);
    }),
  );

  public navEnd$: Observable<Event> = this._router.events.pipe(
    filter(
      event => event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError,
    ),
    tap(() => {
      if (this._routingSpan) {
        runOutsideAngular(() => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          this._routingSpan!.end();
        });
        this._routingSpan = null;
      }
    }),
  );

  private _routingSpan: Span | null;

  private _subscription: Subscription;

  /**
   * @see _isPageloadOngoing()
   */
  private _pageloadOngoing: boolean;

  public constructor(private readonly _router: Router) {
    this._routingSpan = null;
    this._pageloadOngoing = true;

    this._subscription = new Subscription();

    this._subscription.add(this.navStart$.subscribe());
    this._subscription.add(this.resEnd$.subscribe());
    this._subscription.add(this.navEnd$.subscribe());
  }

  /**
   * This is used to prevent memory leaks when the root view is created and destroyed multiple times,
   * since `subscribe` callbacks capture `this` and prevent many resources from being GC'd.
   */
  public ngOnDestroy(): void {
    this._subscription.unsubscribe();
  }

  /**
   * We only _avoid_ creating a navigation root span in one case:
   *
   * There is an ongoing pageload span AND the router didn't yet emit the first navigation start event
   *
   * The first navigation start event will create the child routing span
   * and update the pageload root span name on ResolveEnd.
   *
   * There's an edge case we need to avoid here: If the router fires the first navigation start event
   * _after_ the pageload root span finished. This is why we check for the pageload root span.
   * Possible real-world scenario: Angular application and/or router is bootstrapped after the pageload
   * idle root span finished
   *
   * The overall rationale is:
   * - if we already avoided creating a navigation root span once, we don't avoid it again
   *   (i.e. set `_pageloadOngoing` to `false`)
   * - if `_pageloadOngoing` is already `false`, create a navigation root span
   * - if there's no active/pageload root span, create a navigation root span
   * - only if there's an ongoing pageload root span AND `_pageloadOngoing` is still `true,
   *   don't create a navigation root span
   */
  private _isPageloadOngoing(): boolean {
    if (!this._pageloadOngoing) {
      // pageload is already finished, no need to update
      return false;
    }

    const activeSpan = getActiveSpan();
    if (!activeSpan) {
      this._pageloadOngoing = false;
      return false;
    }

    const rootSpan = getRootSpan(activeSpan);

    this._pageloadOngoing = spanToJSON(rootSpan).attributes[SENTRY_OP] === 'pageload';
    return this._pageloadOngoing;
  }
}

/**
 * Captures the initialization lifecycle of the component this directive is applied to.
 * Specifically, this directive measures the time between `ngOnInit` and `ngAfterViewInit`
 * of the component.
 *
 * Falls back to the component's selector if no name is provided.
 *
 * @example
 * ```html
 * <app-my-component trace="myComponent"></app-my-component>
 * ```
 */
@Directive({ selector: '[trace]' })
export class TraceDirective implements OnInit, AfterViewInit {
  @Input('trace') public componentName?: string;

  private _tracingSpan?: Span;

  public constructor(private readonly _host: ElementRef<HTMLElement>) {}

  /**
   * Implementation of OnInit lifecycle method
   * @inheritdoc
   */
  public ngOnInit(): void {
    if (!this.componentName) {
      // Technically, the `trace` binding should always be provided.
      // However, if it is incorrectly declared on the element without a
      // value (e.g., `<app-component trace />`), we fall back to using `tagName`
      // (which is e.g. `APP-COMPONENT`).
      this.componentName = this._host.nativeElement.tagName.toLowerCase();
    }

    if (getActiveSpan()) {
      this._tracingSpan = runOutsideAngular(() =>
        startInactiveSpan({
          name: `<${this.componentName}>`,
          attributes: {
            [SENTRY_OP]: UI_MOUNT,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.angular.trace_directive',
          },
        }),
      );
    }
  }

  /**
   * Implementation of AfterViewInit lifecycle method
   * @inheritdoc
   */
  public ngAfterViewInit(): void {
    const span = this._tracingSpan;
    if (span) {
      runOutsideAngular(() => span.end());
    }
  }
}

/**
 * A module serves as a single compilation unit for the `TraceDirective` and can be re-used by any other module.
 */
@NgModule({
  declarations: [TraceDirective],
  exports: [TraceDirective],
})
export class TraceModule {}

interface TraceClassOptions {
  /**
   * Name of the class
   */
  name?: string;
}

/**
 * Decorator function that can be used to capture initialization lifecycle of the whole component.
 */
export function TraceClass(options?: TraceClassOptions): ClassDecorator {
  let tracingSpan: Span;

  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  return target => {
    const originalOnInit = target.prototype.ngOnInit;
    target.prototype.ngOnInit = function (...args: unknown[]): ReturnType<typeof originalOnInit> {
      tracingSpan = runOutsideAngular(() =>
        startInactiveSpan({
          onlyIfParent: true,
          name: `<${options?.name || 'unnamed'}>`,
          attributes: {
            [SENTRY_OP]: UI_MOUNT,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.angular.trace_class_decorator',
          },
        }),
      );

      if (originalOnInit) {
        return originalOnInit.apply(this, args);
      }
    };

    const originalAfterViewInit = target.prototype.ngAfterViewInit;
    target.prototype.ngAfterViewInit = function (...args: unknown[]): ReturnType<typeof originalAfterViewInit> {
      if (tracingSpan) {
        runOutsideAngular(() => tracingSpan.end());
      }
      if (originalAfterViewInit) {
        return originalAfterViewInit.apply(this, args);
      }
    };
  };
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}

interface TraceMethodOptions {
  /**
   * Name of the method (is added to the tracing span)
   */
  name?: string;
}

/**
 * Decorator function that can be used to capture a single lifecycle methods of the component.
 */
export function TraceMethod(options?: TraceMethodOptions): MethodDecorator {
  return (_target: unknown, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = function (...args: unknown[]): ReturnType<typeof originalMethod> {
      const now = timestampInSeconds();

      runOutsideAngular(() => {
        startInactiveSpan({
          onlyIfParent: true,
          name: `<${options?.name ? options.name : 'unnamed'}>`,
          startTime: now,
          attributes: {
            [SENTRY_OP]: FUNCTION,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.angular.trace_method_decorator',
            [CODE_FUNCTION_NAME]: String(propertyKey),
          },
        }).end(now);
      });

      if (originalMethod) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return originalMethod.apply(this, args);
      }
    };
    return descriptor;
  };
}

/**
 * Takes the parameterized route from a given ActivatedRouteSnapshot and concatenates the snapshot's
 * child route with its parent to produce the complete parameterized URL of the activated route.
 * This happens recursively until the last child (i.e. the end of the URL) is reached.
 *
 * @param route the ActivatedRouteSnapshot of which its path and its child's path is concatenated
 *
 * @returns the concatenated parameterized route string
 */
export function getParameterizedRouteFromSnapshot(route?: ActivatedRouteSnapshot | null): string {
  const parts: string[] = [];

  let currentRoute = route?.firstChild;
  while (currentRoute) {
    const path = currentRoute?.routeConfig && currentRoute.routeConfig.path;
    if (path === null || path === undefined) {
      break;
    }

    parts.push(path);
    currentRoute = currentRoute.firstChild;
  }

  const fullPath = parts.filter(part => part).join('/');
  return fullPath ? `/${fullPath}/` : '/';
}
