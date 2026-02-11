/* eslint-disable @typescript-eslint/no-explicit-any */

// Partial extract of FastifyRequest interface
// https://github.com/fastify/fastify/blob/87f9f20687c938828f1138f91682d568d2a31e53/types/request.d.ts#L41
interface FastifyRequest {
  routeOptions?: {
    url?: string;
  };
  method?: string;
}

// Partial extract of ExpressRequest interface
interface ExpressRequest {
  route?: {
    path?: string;
  };
  method?: string;
}

export interface MinimalNestJsExecutionContext {
  getType: () => string;

  switchToHttp: () => {
    // minimal request object
    // according to official types, all properties are required but
    // let's play it safe and assume they're optional
    getRequest: () => FastifyRequest | ExpressRequest;
  };

  _sentryInterceptorInstrumented?: boolean;
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

export interface Subscription {
  add(...args: any[]): void;
}

/**
 * A minimal interface for an Observable.
 */
export interface Observable<T> {
  subscribe(next?: (value: T) => void, error?: (err: any) => void, complete?: () => void): Subscription;
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

/**
 * Represents a target method in NestJS annotated with @OnEvent.
 */
export interface OnEventTarget {
  name: string;
  sentryPatched?: boolean;
  __SENTRY_INTERNAL__?: boolean;
}

/**
 * Represents an express NextFunction.
 */
export type NextFunction = (err?: any) => void;
