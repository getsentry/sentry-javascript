export enum LogLevel {
  None = 0,
  Error = 1,
  Debug = 2,
  Verbose = 3,
}

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
