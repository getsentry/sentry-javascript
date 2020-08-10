// tslint:disable:max-classes-per-file

import { AfterViewInit, Directive, Injectable, Input, OnInit } from '@angular/core';
import { Event, NavigationEnd, NavigationStart, Router } from '@angular/router';
import { getCurrentHub } from '@sentry/browser';
import { Span, Transaction, TransactionContext } from '@sentry/types';
import { logger, timestampWithMs } from '@sentry/utils';
import { Observable } from 'rxjs';
import { filter, tap } from 'rxjs/operators';

let instrumentationInitialized: boolean;
let stashedStartTransaction: (context: TransactionContext) => Transaction | undefined;
let stashedStartTransactionOnLocationChange: boolean;

/**
 * Creates routing instrumentation for Angular Router.
 */
export function routingInstrumentation(
  startTransaction: (context: TransactionContext) => Transaction | undefined,
  startTransactionOnPageLoad: boolean = true,
  startTransactionOnLocationChange: boolean = true,
): void {
  instrumentationInitialized = true;
  stashedStartTransaction = startTransaction;
  stashedStartTransactionOnLocationChange = startTransactionOnLocationChange;

  if (startTransactionOnPageLoad) {
    startTransaction({
      name: window.location.pathname,
      op: 'pageload',
    });
  }
}

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
export class TraceService {
  private routingSpan?: Span;

  public constructor(private readonly router: Router) {
    this.navStart$.subscribe();
    this.navEnd$.subscribe();
  }

  public navStart$: Observable<Event> = this.router.events.pipe(
    filter(event => event instanceof NavigationStart),
    tap(event => {
      if (!instrumentationInitialized) {
        logger.error('Angular integration has tracing enabled, but Tracing integration is not configured');
        return;
      }

      const navigationEvent = event as NavigationStart;
      let activeTransaction = getActiveTransaction();

      if (!activeTransaction && stashedStartTransactionOnLocationChange) {
        activeTransaction = stashedStartTransaction({
          name: navigationEvent.url,
          op: 'navigation',
        });
      }

      if (activeTransaction) {
        this.routingSpan = activeTransaction.startChild({
          description: `${navigationEvent.url}`,
          op: `angular.routing`,
          tags: {
            'routing.instrumentation': '@sentry/angular',
            url: navigationEvent.url,
            ...(navigationEvent.navigationTrigger && {
              navigationTrigger: navigationEvent.navigationTrigger,
            }),
          },
        });
      }
    }),
  );

  public navEnd$: Observable<Event> = this.router.events.pipe(
    filter(event => event instanceof NavigationEnd),
    tap(() => {
      if (this.routingSpan) {
        this.routingSpan.finish();
        delete this.routingSpan;
      }
    }),
  );
}

const UNKNOWN_COMPONENT = 'unknown';

/**
 * A directive that can be used to capture initialization lifecycle of the whole component.
 */
@Directive({ selector: '[trace]' })
export class TraceDirective implements OnInit, AfterViewInit {
  private tracingSpan?: Span;

  @Input('trace') public componentName: string = UNKNOWN_COMPONENT;

  /**
   * Implementation of OnInit lifecycle method
   * @inheritdoc
   */
  public ngOnInit(): void {
    const activeTransaction = getActiveTransaction();
    if (activeTransaction) {
      this.tracingSpan = activeTransaction.startChild({
        description: `<${this.componentName}>`,
        op: `angular.initialize`,
      });
    }
  }

  /**
   * Implementation of AfterViewInit lifecycle method
   * @inheritdoc
   */
  public ngAfterViewInit(): void {
    if (this.tracingSpan) {
      this.tracingSpan.finish();
    }
  }
}

/**
 * Decorator function that can be used to capture initialization lifecycle of the whole component.
 */
export function TraceClassDecorator(): ClassDecorator {
  let tracingSpan: Span;

  return (target: Function) => {
    // tslint:disable-next-line:no-unsafe-any
    const originalOnInit = target.prototype.ngOnInit;
    // tslint:disable-next-line:no-unsafe-any
    target.prototype.ngOnInit = function(...args: any[]): ReturnType<typeof originalOnInit> {
      const activeTransaction = getActiveTransaction();
      if (activeTransaction) {
        tracingSpan = activeTransaction.startChild({
          description: `<${target.name}>`,
          op: `angular.initialize`,
        });
      }
      if (originalOnInit) {
        // tslint:disable-next-line:no-unsafe-any
        return originalOnInit.apply(this, args);
      }
    };

    // tslint:disable-next-line:no-unsafe-any
    const originalAfterViewInit = target.prototype.ngAfterViewInit;
    // tslint:disable-next-line:no-unsafe-any
    target.prototype.ngAfterViewInit = function(...args: any[]): ReturnType<typeof originalAfterViewInit> {
      if (tracingSpan) {
        tracingSpan.finish();
      }
      if (originalAfterViewInit) {
        // tslint:disable-next-line:no-unsafe-any
        return originalAfterViewInit.apply(this, args);
      }
    };
  };
}

/**
 * Decorator function that can be used to capture a single lifecycle methods of the component.
 */
export function TraceMethodDecorator(): MethodDecorator {
  return (target: Object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = function(...args: any[]): ReturnType<typeof originalMethod> {
      const now = timestampWithMs();
      const activeTransaction = getActiveTransaction();
      if (activeTransaction) {
        activeTransaction.startChild({
          description: `<${target.constructor.name}>`,
          endTimestamp: now,
          op: `angular.${String(propertyKey)}`,
          startTimestamp: now,
        });
      }
      if (originalMethod) {
        // tslint:disable-next-line:no-unsafe-any
        return originalMethod.apply(this, args);
      }
    };
    return descriptor;
  };
}
