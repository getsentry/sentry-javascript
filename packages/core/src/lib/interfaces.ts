export enum Severity {
  Fatal = 'fatal',
  Error = 'error',
  Warning = 'warning',
  Info = 'info',
  Debug = 'debug',
  Critical = 'critical',
}

export interface Breadcrumb {
  type?: string;
  level?: Severity;
  event_id?: string;
  category?: string;
  message?: string;
  data?: any;
  timestamp?: number;
}

export interface User {
  id?: string;
  email?: string;
  username?: string;
  extra?: any;
}

export interface Context {
  tags?: { [key: string]: string };
  extra?: object;
  user?: User;
}

export interface SdkInfo {
  version?: string;
  name?: string;
  integrations?: string[];
}

export interface StackFrame {
  filename?: string;
  function?: string;
  module?: string;
  platform?: string;
  lineno?: number;
  colno?: number;
  abs_path?: string;
  context_line?: string;
  pre_context?: string;
  post_context?: string;
  in_app?: boolean;
  vars?: { [name: string]: any };
}

export interface Stacktrace {
  frames?: StackFrame[];
  frames_omitted?: [number, number];
}

export interface Thread {
  id?: number;
  name?: string;
  stacktrace?: Stacktrace;
  crashed?: boolean;
  current?: boolean;
}

export interface SentryException {
  type?: string;
  value?: string;
  module?: string;
  thread_id?: number;
  stacktrace?: Stacktrace;
}

export interface Request {
  url?: string;
  method?: string;
  data?: any;
  query_string?: string;
  cookies?: { [key: string]: string };
  env?: { [key: string]: string };
}

// TODO: Add missing fields
export interface SentryEvent extends Context {
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
  modules?: { [key: string]: string };
  fingerprint?: string[];
  exception?: SentryException[];
  stacktrace?: Stacktrace;
  breadcrumbs?: Breadcrumb[];
}

export enum LogLevel {
  None = 0,
  Error = 1,
  Debug = 2,
  Verbose = 3,
}

// TODO: Rework options
export interface Options {
  release?: string;
  environment?: string;
  logLevel?: LogLevel;
  maxBreadcrumbs?: number;
  ignoreErrors?: Array<string | RegExp>;
  ignoreUrls?: Array<string | RegExp>;
  whitelistUrls?: Array<string | RegExp>;
  includePaths?: Array<string | RegExp>;
  shouldSend?: (e: SentryEvent) => boolean;
  beforeSend?: (e: SentryEvent) => SentryEvent;
  afterSend?: (e: SentryEvent) => void;
  shouldAddBreadcrumb?: (b: Breadcrumb) => boolean;
  beforeBreadcrumb?: (b: Breadcrumb) => Breadcrumb;
  afterBreadcrumb?: (b: Breadcrumb) => Breadcrumb;
}

export interface Adapter {
  readonly options: {};
  install(): Promise<boolean>;
  captureException(exception: any): Promise<SentryEvent>;
  captureMessage(message: string): Promise<SentryEvent>;
  captureBreadcrumb(breadcrumb: Breadcrumb): Promise<Breadcrumb>;
  send(event: SentryEvent): Promise<void>;
  setOptions(options: Options): Promise<void>;
  getContext(): Promise<Context>;
  setContext(context: Context): Promise<void>;
}
