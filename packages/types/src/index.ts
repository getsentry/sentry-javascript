/** Supported Sentry transport protocols in a DSN. */
export type DSNProtocol = 'http' | 'https';

/** Primitive components of a DSN. */
export interface DSNComponents {
  /** Protocol used to connect to Sentry. */
  protocol: DSNProtocol;
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

/** Anything that can be parsed into a DSN. */
export type DSNLike = string | DSNComponents;

/** TODO */
export enum Severity {
  /** TODO */
  Fatal = 'fatal',
  /** TODO */
  Error = 'error',
  /** TODO */
  Warning = 'warning',
  /** TODO */
  Log = 'log',
  /** TODO */
  Info = 'info',
  /** TODO */
  Debug = 'debug',
  /** TODO */
  Critical = 'critical',
}

/** TODO */
export interface Breadcrumb {
  type?: string;
  level?: Severity;
  event_id?: string;
  category?: string;
  message?: string;
  data?: any;
  timestamp?: number;
}

/** TODO */
export interface User {
  id?: string;
  ip_address?: string;
  email?: string;
  username?: string;
  extra?: { [key: string]: any };
}

/** TODO */
export interface SdkInfo {
  name: string;
  version: string;
  integrations?: string[];
  packages?: Package[];
}

/** TODO */
export interface Package {
  name: string;
  version: string;
}

/** TODO */
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

/** TODO */
export interface Stacktrace {
  frames?: StackFrame[];
  frames_omitted?: [number, number];
}

/** TODO */
export interface Thread {
  id?: number;
  name?: string;
  stacktrace?: Stacktrace;
  crashed?: boolean;
  current?: boolean;
}

/** TODO */
export interface SentryException {
  type?: string;
  value?: string;
  module?: string;
  thread_id?: number;
  stacktrace?: Stacktrace;
}

/** TODO */
export interface Request {
  url?: string;
  method?: string;
  data?: any;
  query_string?: string;
  cookies?: { [key: string]: string };
  env?: { [key: string]: string };
  headers?: { [key: string]: string };
}

/** TODO */
export interface SentryEvent {
  event_id?: string;
  message?: string;
  timestamp?: number;
  level?: Severity;
  platform?: string;
  logger?: string;
  server?: string;
  release?: string;
  dist?: string;
  environment?: string;
  sdk?: SdkInfo;
  request?: Request;
  transaction?: string;
  modules?: { [key: string]: string };
  fingerprint?: string[];
  exception?: {
    values: SentryException[];
  };
  stacktrace?: Stacktrace;
  breadcrumbs?: Breadcrumb[];
  contexts?: { [key: string]: object };
  tags?: { [key: string]: string };
  extra?: { [key: string]: any };
  user?: User;
}

/** TODO */
export interface Integration {
  name: string;
  handler?: any;
  install(): void;
}

/** TODO */
export interface SentryResponse {
  status: Status;
}

/** TODO */
export interface TransportOptions {
  dsn: DSNLike;
  /** Define custom headers */
  headers?: object;
}

/** TODO */
export interface Transport {
  send(event: SentryEvent): Promise<SentryResponse>;
}

/** TODO */
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

export interface SentryWrappedFunction extends Function {
  [key: string]: any;
  __sentry__?: boolean;
  __sentry_wrapper__?: SentryWrappedFunction;
  __sentry_original__?: SentryWrappedFunction;
}
