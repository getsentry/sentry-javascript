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

export interface Observer<T> {
  next(value: T): void;
  error?(err: any): void;
  complete?(): void;
}

/**
 * A minimal interface for an Observable.
 */
export interface Observable<T> {
  pipe: (...args: any[]) => Observable<any>;
  subscribe(next: (value: T) => void, error?: (err: any) => void, complete?: () => void): any;
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

/**
 * Represents a target class in NestJS annotated with @Catch.
 */
export interface CatchTarget {
  name: string;
  sentryPatched?: boolean;
  __SENTRY_INTERNAL__?: boolean;
  prototype: {
    catch?: (...args: any[]) => any;
  };
}
