/* eslint-disable max-lines */
import type { AfterViewInit, OnDestroy, OnInit } from '@angular/core';
import { Directive, Injectable, Input, NgModule } from '@angular/core';
import type { ActivatedRouteSnapshot, Event, Router } from '@angular/router';
import { NavigationEnd, NavigationStart, ResolveEnd } from '@angular/router';
import { getCurrentHub, WINDOW } from '@sentry/browser';
import type { Span, Transaction, TransactionContext } from '@sentry/types';
import { logger, stripUrlQueryAndFragment, timestampWithMs } from '@sentry/utils';
import type { Observable } from 'rxjs';
import { Subscription } from 'rxjs';
import { filter, tap } from 'rxjs/operators';

import { ANGULAR_INIT_OP, ANGULAR_OP, ANGULAR_ROUTING_OP } from './constants';
import { IS_DEBUG_BUILD } from './flags';
import { runOutsideAngular } from './zone';

let instrumentationInitialized: boolean;
let stashedStartTransaction: (context: TransactionContext) => Transaction | undefined;
let stashedStartTransactionOnLocationChange: boolean;

/**
 * Creates routing instrumentation for Angular Router.
 */
export function routingInstrumentation(
  customStartTransaction: (context: TransactionContext) => Transaction | undefined,
  startTransactionOnPageLoad: boolean = true,
  startTransactionOnLocationChange: boolean = true,
): void {
  instrumentationInitialized = true;
  stashedStartTransaction = customStartTransaction;
  stashedStartTransactionOnLocationChange = startTransactionOnLocationChange;

  if (startTransactionOnPageLoad && WINDOW && WINDOW.location) {
    customStartTransaction({
      name: WINDOW.location.pathname,
      op: 'pageload',
      metadata: { source: 'url' },
    });
  }
}

export const instrumentAngularRouting = routingInstrumentation;

/**
 * Grabs active transaction off scope
 */
export function getActiveTransaction(): Transaction | undefined {
  const currentHub = getCurrentHub();

  if (currentHub) {
    const scope = currentHub.getScope();
    if (scope) {
      return scope.getTransaction();
    }
  }

  return undefined;
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
          logger.error('Angular integration has tracing enabled, but Tracing integration is not configured');
        return;
      }

      const strippedUrl = stripUrlQueryAndFragment(navigationEvent.url);
      let activeTransaction = getActiveTransaction();

      if (!activeTransaction && stashedStartTransactionOnLocationChange) {
        activeTransaction = stashedStartTransaction({
          name: strippedUrl,
          op: 'navigation',
          metadata: { source: 'url' },
        });
      }

      if (activeTransaction) {
        if (this._routingSpan) {
          this._routingSpan.finish();
        }
        this._routingSpan = activeTransaction.startChild({
          description: `${navigationEvent.url}`,
          op: ANGULAR_ROUTING_OP,
          tags: {
            'routing.instrumentation': '@sentry/angular',
            url: strippedUrl,
            ...(navigationEvent.navigationTrigger && {
              navigationTrigger: navigationEvent.navigationTrigger,
            }),
          },
        });
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
      const route = getParameterizedRouteFromSnapshot(event.state.root);

      const transaction = getActiveTransaction();
      // TODO (v8 / #5416): revisit the source condition. Do we want to make the parameterized route the default?
      if (transaction && transaction.metadata.source === 'url') {
        transaction.setName(route, 'route');
      }
    }),
  );

  public navEnd$: Observable<Event> = this._router.events.pipe(
    filter(event => event instanceof NavigationEnd),
    tap(() => {
      if (this._routingSpan) {
        runOutsideAngular(() => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          this._routingSpan!.finish();
        });
        this._routingSpan = null;
      }
    }),
  );

  private _routingSpan: Span | null = null;

  private _subscription: Subscription = new Subscription();

  public constructor(private readonly _router: Router) {
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
}

const UNKNOWN_COMPONENT = 'unknown';

/**
 * A directive that can be used to capture initialization lifecycle of the whole component.
 */
@Directive({ selector: '[trace]' })
export class TraceDirective implements OnInit, AfterViewInit {
  @Input('trace') public componentName?: string;

  private _tracingSpan?: Span;

  /**
   * Implementation of OnInit lifecycle method
   * @inheritdoc
   */
  public ngOnInit(): void {
    if (!this.componentName) {
      this.componentName = UNKNOWN_COMPONENT;
    }

    const activeTransaction = getActiveTransaction();
    if (activeTransaction) {
      this._tracingSpan = activeTransaction.startChild({
        description: `<${this.componentName}>`,
        op: ANGULAR_INIT_OP,
      });
    }
  }

  /**
   * Implementation of AfterViewInit lifecycle method
   * @inheritdoc
   */
  public ngAfterViewInit(): void {
    if (this._tracingSpan) {
      this._tracingSpan.finish();
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

/**
 * Decorator function that can be used to capture initialization lifecycle of the whole component.
 */
export function TraceClassDecorator(): ClassDecorator {
  let tracingSpan: Span;

  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return target => {
    const originalOnInit = target.prototype.ngOnInit;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    target.prototype.ngOnInit = function (...args: any[]): ReturnType<typeof originalOnInit> {
      const activeTransaction = getActiveTransaction();
      if (activeTransaction) {
        tracingSpan = activeTransaction.startChild({
          description: `<${target.name}>`,
          op: ANGULAR_INIT_OP,
        });
      }
      if (originalOnInit) {
        return originalOnInit.apply(this, args);
      }
    };

    const originalAfterViewInit = target.prototype.ngAfterViewInit;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    target.prototype.ngAfterViewInit = function (...args: any[]): ReturnType<typeof originalAfterViewInit> {
      if (tracingSpan) {
        tracingSpan.finish();
      }
      if (originalAfterViewInit) {
        return originalAfterViewInit.apply(this, args);
      }
    };
  };
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */
}

/**
 * Decorator function that can be used to capture a single lifecycle methods of the component.
 */
export function TraceMethodDecorator(): MethodDecorator {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/ban-types
  return (target: Object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor.value = function (...args: any[]): ReturnType<typeof originalMethod> {
      const now = timestampWithMs();
      const activeTransaction = getActiveTransaction();
      if (activeTransaction) {
        activeTransaction.startChild({
          description: `<${target.constructor.name}>`,
          endTimestamp: now,
          op: `${ANGULAR_OP}.${String(propertyKey)}`,
          startTimestamp: now,
        });
      }
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
 * @param route the ActivatedRouteSnapshot of which its path and its child's path is concantenated
 *
 * @returns the concatenated parameterzited route string
 */
export function getParameterizedRouteFromSnapshot(route?: ActivatedRouteSnapshot | null): string {
  const path = route && route.firstChild && route.firstChild.routeConfig && route.firstChild.routeConfig.path;
  if (!path) {
    return '/';
  }
  return `/${path}${getParameterizedRouteFromSnapshot(route && route.firstChild)}`;
}
