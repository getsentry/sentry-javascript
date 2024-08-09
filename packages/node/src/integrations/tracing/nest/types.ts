/* eslint-disable @typescript-eslint/no-explicit-any */

interface MinimalNestJsExecutionContext {
  getType: () => string;

  switchToHttp: () => {
    // minimal request object
    // according to official types, all properties are required but
    // let's play it safe and assume they're optional
    getRequest: () => {
      route?: {
        path?: string;
      };
      method?: string;
    };
  };
}

export interface NestJsErrorFilter {
  catch(exception: any, host: any): void;
}

export interface MinimalNestJsApp {
  useGlobalFilters: (arg0: NestJsErrorFilter) => void;
  useGlobalInterceptors: (interceptor: {
    intercept: (context: MinimalNestJsExecutionContext, next: { handle: () => any }) => any;
  }) => void;
}

/**
 * A minimal interface for an Observable.
 */
export interface Observable<T> {
  subscribe(observer: (value: T) => void): void;
}

/**
 * A NestJS call handler. Used in interceptors to start the route execution.
 */
export interface CallHandler {
  handle(...args: any[]): Observable<any>;
}

/**
 * Represents an injectable target class in NestJS.
 */
export interface InjectableTarget {
  name: string;
  sentryPatched?: boolean;
  __SENTRY_INTERNAL__?: boolean;
  prototype: {
    use?: (req: unknown, res: unknown, next: () => void, ...args: any[]) => void;
    canActivate?: (...args: any[]) => boolean | Promise<boolean> | Observable<boolean>;
    transform?: (...args: any[]) => any;
    intercept?: (context: unknown, next: CallHandler, ...args: any[]) => Observable<any>;
  };
}

export interface InjectTarget {
  name: string;
  sentryPatched?: boolean;
  __SENTRY_INTERNAL__?: boolean;
  prototype: {
    set?: (key: string, value: unknown, ...args: any[]) => Promise<void> | void;
    get?: (key: string, ...args: any[]) => Promise<unknown> | undefined;
    del?: (key: string, ...args: any[]) => void | Promise<void>;
  }
}
