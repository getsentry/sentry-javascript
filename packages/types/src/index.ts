/** Supported Sentry transport protocols in a Dsn. */
export type DsnProtocol = 'http' | 'https';

/** Primitive components of a Dsn. */
export interface DsnComponents {
  /** Protocol used to connect to Sentry. */
  protocol: DsnProtocol;
  /** Public authorization key. */
  user: string;
  /** Private authorization key (deprecated, optional). */
  pass?: string;
  /** Hostname of the Sentry instance. */
  host: string;
  /** Port of the Sentry instance. */
  port?: string;
  /** Sub path/ */
  path?: string;
  /** Project ID */
  projectId: string;
}

/** Anything that can be parsed into a Dsn. */
export type DsnLike = string | DsnComponents;

/** JSDoc */
export enum Severity {
  /** JSDoc */
  Fatal = 'fatal',
  /** JSDoc */
  Error = 'error',
  /** JSDoc */
  Warning = 'warning',
  /** JSDoc */
  Log = 'log',
  /** JSDoc */
  Info = 'info',
  /** JSDoc */
  Debug = 'debug',
  /** JSDoc */
  Critical = 'critical',
}

// tslint:disable:no-unnecessary-qualifier no-namespace
export namespace Severity {
  /**
   * Converts a string-based level into a {@link Severity}.
   *
   * @param level string representation of Severity
   * @returns Severity
   */
  export function fromString(level: string): Severity {
    switch (level) {
      case 'debug':
        return Severity.Debug;
      case 'info':
        return Severity.Info;
      case 'warn':
      case 'warning':
        return Severity.Warning;
      case 'error':
        return Severity.Error;
      case 'fatal':
        return Severity.Fatal;
      case 'critical':
        return Severity.Critical;
      case 'log':
      default:
        return Severity.Log;
    }
  }
}

/** JSDoc */
export interface Breadcrumb {
  type?: string;
  level?: Severity;
  event_id?: string;
  category?: string;
  message?: string;
  data?: any;
  timestamp?: number;
}

/** JSDoc */
export interface User {
  [key: string]: any;
  id?: string;
  ip_address?: string;
  email?: string;
  username?: string;
}

/** JSDoc */
export interface SdkInfo {
  name: string;
  version: string;
  integrations?: string[];
  packages?: Package[];
}

/** JSDoc */
export interface Package {
  name: string;
  version: string;
}

/** JSDoc */
export interface StackFrame {
  filename?: string;
  function?: string;
  module?: string;
  platform?: string;
  lineno?: number;
  colno?: number;
  abs_path?: string;
  context_line?: string;
  pre_context?: string[];
  post_context?: string[];
  in_app?: boolean;
  vars?: { [key: string]: any };
}

/** JSDoc */
export interface Stacktrace {
  frames?: StackFrame[];
  frames_omitted?: [number, number];
}

/** JSDoc */
export interface Thread {
  id?: number;
  name?: string;
  stacktrace?: Stacktrace;
  crashed?: boolean;
  current?: boolean;
}

/** JSDoc */
export interface SentryException {
  type?: string;
  value?: string;
  module?: string;
  thread_id?: number;
  stacktrace?: Stacktrace;
}

/** JSDoc */
export interface Request {
  url?: string;
  method?: string;
  data?: any;
  query_string?: string;
  cookies?: { [key: string]: string };
  env?: { [key: string]: string };
  headers?: { [key: string]: string };
}

/** JSDoc */
export interface SentryEvent {
  event_id?: string;
  message?: string;
  timestamp?: number;
  level?: Severity;
  platform?: string;
  logger?: string;
  server_name?: string;
  release?: string;
  dist?: string;
  environment?: string;
  sdk?: SdkInfo;
  request?: Request;
  transaction?: string;
  modules?: { [key: string]: string };
  fingerprint?: string[];
  exception?: {
    values?: SentryException[];
    mechanism?: Mechanism;
  };
  stacktrace?: Stacktrace;
  breadcrumbs?: Breadcrumb[];
  contexts?: { [key: string]: object };
  tags?: { [key: string]: string };
  extra?: { [key: string]: any };
  user?: User;
}

/** JSDoc */
export interface Mechanism {
  type: string;
  handled: boolean;
  data?: {
    [key: string]: string;
  };
}

/** Integration interface */
export interface Integration {
  /**
   * Returns {@link IntegrationClass.id}
   */
  name: string;
  // TODO: Remove with v5
  /** @deprecated */
  install?(options?: object): void;

  // This takes no options on purpose, options should be passed in the constructor
  setupOnce(): void; // TODO: make not optional
}

/** Integration Class Interface */
export interface IntegrationClass<T> {
  new (): T;
  /**
   * Property that holds the integration name
   */
  id: string;
}

/** JSDoc */
export interface SentryResponse {
  status: Status;
  event?: SentryEvent;
  reason?: string;
}

/** JSDoc */
export interface TransportOptions {
  [key: string]: any;
  /** Sentry DSN */
  dsn: DsnLike;
  /** Define custom headers */
  headers?: object;
  /** Set a HTTP proxy that should be used for outbound requests. */
  httpProxy?: string;
  /** Set a HTTPS proxy that should be used for outbound requests. */
  httpsProxy?: string;
  /** HTTPS proxy certificates path */
  caCerts?: string;
}

/** Transport used sending data to Sentry */
export interface Transport {
  /**
   * Sends the body to the Store endpoint in Sentry.
   *
   * @param body String body that should be sent to Sentry.
   */
  sendEvent(body: string): Promise<SentryResponse>;

  /**
   * Call this function to wait until all pending requests have been sent.
   *
   * @param timeout Number time in ms to wait until the buffer is drained.
   */
  close(timeout?: number): Promise<boolean>;

  // TODO: Remove with v5
  /** @deprecated Implement sendEvent instead */
  captureEvent?(event: SentryEvent): Promise<SentryResponse>;
}

/** JSDoc */
export interface TransportClass<T extends Transport> {
  new (options: TransportOptions): T;
}

/** The status of an event. */
export enum Status {
  /** The status could not be determined. */
  Unknown = 'unknown',
  /** The event was skipped due to configuration or callbacks. */
  Skipped = 'skipped',
  /** The event was sent to Sentry successfully. */
  Success = 'success',
  /** The client is currently rate limited and will try again later. */
  RateLimit = 'rate_limit',
  /** The event could not be processed. */
  Invalid = 'invalid',
  /** A server-side error ocurred during submission. */
  Failed = 'failed',
}

// tslint:disable:no-unnecessary-qualifier no-namespace
export namespace Status {
  /**
   * Converts a HTTP status code into a {@link Status}.
   *
   * @param code The HTTP response status code.
   * @returns The send status or {@link Status.Unknown}.
   */
  export function fromHttpCode(code: number): Status {
    if (code >= 200 && code < 300) {
      return Status.Success;
    }

    if (code === 429) {
      return Status.RateLimit;
    }

    if (code >= 400 && code < 500) {
      return Status.Invalid;
    }

    if (code >= 500) {
      return Status.Failed;
    }

    return Status.Unknown;
  }
}

/** JSDoc */
export interface SentryWrappedFunction extends Function {
  [key: string]: any;
  __sentry__?: boolean;
  __sentry_wrapped__?: SentryWrappedFunction;
  __sentry_original__?: SentryWrappedFunction;
}

/** JSDoc */
export interface SentryEventHint {
  event_id?: string;
  syntheticException?: Error | null;
  originalException?: Error | null;
  data?: any;
}

/** JSDoc */
export interface SentryBreadcrumbHint {
  [key: string]: any;
}
